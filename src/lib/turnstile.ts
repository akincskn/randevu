import { z } from "zod";

import { ApiError } from "./api-error";
import { serverEnv } from "./env";

/**
 * Spec satır 65: "Basit bot/insan doğrulaması (örn. Cloudflare Turnstile) — ücretsiz,
 * SMS/OTP maliyeti yok."
 */
const DOGRULAMA_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** CLAUDE.md §2: tüm dış çağrılarda timeout zorunlu. */
const ZAMAN_ASIMI_MS = 5_000;

const yanitSemasi = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional(),
});

/**
 * Turnstile token'ını Cloudflare'e doğrulatır.
 * Cloudflare token'ı REDDEDERSE `ApiError(TURNSTILE_FAILED, 403)` fırlatır.
 *
 * FAIL-OPEN (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-15 onaylı):
 * Cloudflare'e ULAŞILAMAZSA (ağ hatası, timeout, 5xx) kontrol ATLANIR ve loglanır.
 * "Cloudflare cevap vermedi" ile "Cloudflare bot dedi" bilinçli olarak ayrılır:
 * birincisi bizim altyapı sorunumuz, ikincisi gerçek bir ret kararıdır.
 */
export async function turnstileDogrula(token: string, istemciIp?: string): Promise<void> {
  const govde = new URLSearchParams({
    secret: serverEnv().TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (istemciIp) {
    govde.set("remoteip", istemciIp);
  }

  const kontrol = AbortSignal.timeout(ZAMAN_ASIMI_MS);

  let ham: unknown;
  try {
    const yanit = await fetch(DOGRULAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: govde,
      signal: kontrol,
    });

    if (!yanit.ok) {
      throw new Error(`Turnstile HTTP ${yanit.status}`);
    }
    ham = await yanit.json();
  } catch (error) {
    console.error("[turnstile] doğrulama çağrısı başarısız, kontrol ATLANIYOR (fail-open):", error);
    return;
  }

  const cozumlenen = yanitSemasi.safeParse(ham);

  // Yanıt çözümlenemedi -> Cloudflare tarafında beklenmedik bir durum, ret DEĞİL.
  if (!cozumlenen.success) {
    console.error("[turnstile] yanıt çözümlenemedi, kontrol ATLANIYOR (fail-open):", ham);
    return;
  }

  // Cloudflare açıkça "bu bir bot" dedi — bu gerçek bir ret kararıdır, uygulanır.
  if (!cozumlenen.data.success) {
    console.error("[turnstile] doğrulama reddedildi:", cozumlenen.data["error-codes"]);
    throw new ApiError(
      "TURNSTILE_FAILED",
      403,
      "Bot doğrulaması başarısız. Lütfen tekrar deneyin.",
    );
  }
}
