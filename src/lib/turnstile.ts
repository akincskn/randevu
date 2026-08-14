import { z } from "zod";

import { ApiError } from "./api-error";
import { serverEnv } from "./env";

/**
 * Spec satır 46: "Basit bot/insan doğrulaması (örn. Cloudflare Turnstile) — ücretsiz,
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
 * Başarısızsa `ApiError(TURNSTILE_FAILED, 403)` fırlatır.
 *
 * Ağ hatası/timeout da başarısızlık sayılır (fail-closed) — doğrulama yapılamadıysa
 * isteğin insan kaynaklı olduğu varsayılamaz.
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
    console.error("[turnstile] doğrulama çağrısı başarısız:", error);
    throw new ApiError(
      "TURNSTILE_FAILED",
      403,
      "Bot doğrulaması tamamlanamadı. Lütfen sayfayı yenileyip tekrar deneyin.",
    );
  }

  const cozumlenen = yanitSemasi.safeParse(ham);
  if (!cozumlenen.success || !cozumlenen.data.success) {
    const kodlar = cozumlenen.success ? cozumlenen.data["error-codes"] : undefined;
    console.error("[turnstile] doğrulama reddedildi:", kodlar ?? "yanıt çözümlenemedi");
    throw new ApiError(
      "TURNSTILE_FAILED",
      403,
      "Bot doğrulaması başarısız. Lütfen tekrar deneyin.",
    );
  }
}
