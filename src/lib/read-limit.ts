import type { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { redis, REDIS_ZAMAN_ASIMI_MS, SAYAC_SCRIPT } from "./redis";
import { withTimeout } from "./timeout";

/**
 * Public OKUMA route'ları için IP bazlı limit — CLAUDE.md §2:
 * "rate-limited via Upstash where the route is public (unauthenticated)".
 *
 * Spec satır 74'teki telefon bazlı GÜNLÜK kotadan (bkz. `rate-limit.ts`) AYRIDIR
 * ve onun yerine geçmez: o, bir numaranın kaç randevu TALEP edebileceğini sınırlar;
 * bu ise işletme/müsaitlik listelerinin kazınmasını (scraping) yavaşlatır. Okuma
 * yan etkisiz olduğu için pencere kısa ve limit yüksek tutulur — gerçek bir müşteri
 * tarih değiştirdikçe onlarca istek atar, ona asla değmemelidir.
 */
const DAKIKALIK_OKUMA_LIMITI = 120;
const PENCERE_SANIYE = 60;

/**
 * İstemci IP'si. Vercel/proxy arkasında `x-forwarded-for` ilk değeri gerçek
 * istemcidir. Başlık yoksa (doğrudan bağlantı, test) limit uygulanamaz —
 * TÜM IP'siz istekleri tek anahtarda toplamak, tek bir istemcinin herkesi
 * kilitlemesine yol açardı.
 */
function istemciIp(request: NextRequest): string | null {
  const ham = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ham && ham.length > 0 ? ham : null;
}

/**
 * Public okuma kotasını tüketir; limit aşıldıysa 429 fırlatır.
 *
 * FAIL-OPEN (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-15 onaylı):
 * Upstash erişilemezse kontrol ATLANIR ve loglanır. Bir Upstash kesintisinin
 * dükkanın randevu sayfasını tamamen kapatması kabul edilmiş politikaya aykırıdır.
 *
 * `kapsam`, farklı route'ların birbirinin kotasını yememesi için anahtara girer.
 */
export async function okumaKotasiTuket(request: NextRequest, kapsam: string): Promise<void> {
  const ip = istemciIp(request);
  if (!ip) return;

  // Pencere sınırı: sabit pencere, saniyeden türetilir.
  const pencere = Math.floor(Date.now() / (PENCERE_SANIYE * 1000));
  const anahtar = `randevu:okuma:${kapsam}:${ip}:${pencere}`;

  let sayac: number;
  try {
    sayac = await withTimeout(
      redis().eval(SAYAC_SCRIPT, [anahtar], [PENCERE_SANIYE]) as Promise<number>,
      REDIS_ZAMAN_ASIMI_MS,
      "Upstash okuma limiti",
    );
  } catch (error) {
    console.error("[read-limit] Upstash erişilemedi, kontrol ATLANIYOR (fail-open):", error);
    return;
  }

  if (sayac > DAKIKALIK_OKUMA_LIMITI) {
    throw new ApiError("RATE_LIMITED", 429, "Çok fazla istek gönderildi. Lütfen biraz bekleyin.");
  }
}
