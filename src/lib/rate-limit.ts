import { Redis } from "@upstash/redis";

import { ApiError } from "./api-error";
import { serverEnv } from "./env";

/**
 * Spec satır 45: "Aynı telefon numarasından günlük randevu talebi sayısı sınırlıdır."
 *
 * Sabit pencere (fixed window) sayacı: gün başına bir anahtar, INCR + EXPIRE.
 * Kayan pencereye göre daha kaba ama spec "günlük" dediği için gün sınırı
 * zaten doğal pencere; ek karmaşıklık gereksiz (CLAUDE.md §2 KISS).
 */
const GUNLUK_TALEP_LIMITI = 5;
const GUN_SANIYE = 24 * 60 * 60;

let cachedRedis: Redis | null = null;

function redis(): Redis {
  if (cachedRedis) return cachedRedis;
  const env = serverEnv();
  cachedRedis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cachedRedis;
}

/** Pencere anahtarı — telefon + takvim günü (UTC). */
function gunlukAnahtar(telefon: string): string {
  const gun = new Date().toISOString().slice(0, 10);
  return `randevu:talep:${telefon}:${gun}`;
}

export interface RateLimitSonuc {
  kalan: number;
  limit: number;
}

/**
 * Telefon numarası için günlük talep kotasını tüketir.
 * Kota aşıldıysa `ApiError(RATE_LIMITED, 429)` fırlatır.
 *
 * Upstash erişilemezse istek REDDEDİLİR (fail-closed). Gerekçe: rate limit bir
 * kötüye kullanım korumasıdır; sayaç çalışmıyorken kapıyı açık bırakmak
 * korumanın kendisini anlamsız kılar. Redis kesintisi nadir, kötüye kullanım kalıcı.
 */
export async function gunlukTalepKotasiTuket(telefon: string): Promise<RateLimitSonuc> {
  const anahtar = gunlukAnahtar(telefon);

  let sayac: number;
  try {
    sayac = await redis().incr(anahtar);
    if (sayac === 1) {
      await redis().expire(anahtar, GUN_SANIYE);
    }
  } catch (error) {
    console.error("[rate-limit] Upstash erişilemedi, istek reddediliyor:", error);
    throw new ApiError(
      "RATE_LIMITED",
      503,
      "Servis geçici olarak randevu talebi alamıyor. Lütfen birazdan tekrar deneyin.",
    );
  }

  if (sayac > GUNLUK_TALEP_LIMITI) {
    throw new ApiError(
      "RATE_LIMITED",
      429,
      `Bu telefon numarasıyla günde en fazla ${GUNLUK_TALEP_LIMITI} randevu talebi oluşturabilirsiniz.`,
    );
  }

  return { kalan: GUNLUK_TALEP_LIMITI - sayac, limit: GUNLUK_TALEP_LIMITI };
}
