import { Redis } from "@upstash/redis";

import { yerelAnHesapla } from "./availability";
import { ApiError } from "./api-error";
import { serverEnv } from "./env";
import { withTimeout } from "./timeout";

/**
 * Spec satır 45: "Aynı telefon numarasından günlük randevu talebi sayısı sınırlıdır."
 */
const GUNLUK_TALEP_LIMITI = 5;
const GUN_SANIYE = 24 * 60 * 60;
const REDIS_ZAMAN_ASIMI_MS = 3_000;

/**
 * Pencere, işletmenin faaliyet gösterdiği takvim gününe göre hesaplanır
 * (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-15 onaylı).
 *
 * UTC kullanılsaydı pencere yerel saatle 03:00'te sıfırlanır ve aynı numara
 * 02:00'de 5, 03:05'te 5 talep daha atabilirdi.
 */
const PENCERE_TIMEZONE = "Europe/Istanbul";

/**
 * INCR + EXPIRE'ı TEK atomik adımda yapar.
 *
 * İki ayrı çağrı kullanılsaydı, `incr` başarılı olup `expire` düştüğünde anahtar
 * TTL'siz kalır ve o telefon numarası KALICI olarak engellenirdi. Lua script'i
 * Redis'te bölünmeden çalışır; ya ikisi de olur ya hiçbiri.
 *
 * `PEXPIRE ... NX` yerine TTL kontrolü elle yapılır: NX seçeneği eski Redis
 * sürümlerinde yoktur ve Upstash uyumluluğu garanti değildir.
 */
const SAYAC_SCRIPT = `
  local sayac = redis.call('INCR', KEYS[1])
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return sayac
`;

/**
 * Telafi iadesi — TABAN GÜVENLİKLİ decrement.
 *
 * Çıplak `DECR` sayacı negatife düşürebilir ve bu doğrudan bir limit bypass'ıdır:
 * -5'e inmiş bir sayaç, o numaraya gün içinde 5 yerine 10 talep hakkı kazandırır.
 * Script sayacı 0'ın altına indirmez; ayrıca DECR yeni bir anahtar yaratmışsa
 * (eşleşen INCR olmadan) TTL'siz kalmasını da engeller.
 */
const IADE_SCRIPT = `
  local sayac = redis.call('DECR', KEYS[1])
  if sayac < 0 then
    sayac = redis.call('INCR', KEYS[1])
  end
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return sayac
`;

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

function gunlukAnahtar(telefon: string): string {
  const gun = yerelAnHesapla(new Date(), PENCERE_TIMEZONE).isoGun;
  return `randevu:talep:${telefon}:${gun}`;
}

export interface KotaSonuc {
  /** İstek devam edebilir mi (limit aşılmadıysa true). */
  izinVerildi: boolean;
  /**
   * Sayaç GERÇEKTEN artırıldı mı.
   *
   * Fail-open durumunda `false` olur: Upstash erişilemediği için sayaç hiç
   * artmamıştır. Telafi iadesi YALNIZCA `true` olduğunda tetiklenmelidir —
   * aksi halde eşleşen INCR'si olmayan bir DECR sayacı düşürür ve limit bypass'ı
   * doğar (canlı olarak gözlendi: sayaç -5, ardından 10+ talep geçti).
   */
  artirildiMi: boolean;
}

/**
 * Telefon numarası için günlük talep kotasını tüketir.
 *
 * FAIL-OPEN (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-15 onaylı):
 * Upstash erişilemezse kontrol ATLANIR ve loglanır; randevu akışı durmaz.
 * Gerekçe ürün kararıdır — bir Upstash kesintisinin dükkanın online randevusunu
 * tamamen kapatması, kötüye kullanım riskinden daha maliyetlidir.
 */
export async function gunlukTalepKotasiTuket(telefon: string): Promise<KotaSonuc> {
  const anahtar = gunlukAnahtar(telefon);

  let sayac: number;
  try {
    sayac = await withTimeout(
      redis().eval(SAYAC_SCRIPT, [anahtar], [GUN_SANIYE]) as Promise<number>,
      REDIS_ZAMAN_ASIMI_MS,
      "Upstash rate limit",
    );
  } catch (error) {
    console.error("[rate-limit] Upstash erişilemedi, kontrol ATLANIYOR (fail-open):", error);
    return { izinVerildi: true, artirildiMi: false };
  }

  return { izinVerildi: sayac <= GUNLUK_TALEP_LIMITI, artirildiMi: true };
}

/** 429 yanıtı — çağıran taraf `izinVerildi === false` gördüğünde fırlatır. */
export function kotaAsimiHatasi(): ApiError {
  return new ApiError(
    "RATE_LIMITED",
    429,
    `Bu telefon numarasıyla günde en fazla ${GUNLUK_TALEP_LIMITI} randevu talebi oluşturabilirsiniz.`,
  );
}

/**
 * Tüketilen kotayı geri verir (telafi edici decrement).
 *
 * Randevu iş kuralı nedeniyle reddedildiğinde (slot dolu, dükkan kapalı, geçmiş
 * saat) müşteri aslında rezervasyon YAPMAMIŞTIR; hakkının yanması haksızdır.
 * Yalnızca gerçekten oluşturulan randevular günlük hakkı tüketir.
 *
 * Sessizce başarısız olur: telafi edilemeyen bir sayaç, en fazla müşterinin o gün
 * bir hakkını kaybetmesine yol açar — isteği reddetmek için sebep değildir.
 */
export async function gunlukTalepKotasiIadeEt(telefon: string): Promise<void> {
  try {
    await withTimeout(
      redis().eval(IADE_SCRIPT, [gunlukAnahtar(telefon)], [GUN_SANIYE]) as Promise<number>,
      REDIS_ZAMAN_ASIMI_MS,
      "Upstash kota iadesi",
    );
  } catch (error) {
    console.error("[rate-limit] kota iadesi başarısız (yok sayılıyor):", error);
  }
}
