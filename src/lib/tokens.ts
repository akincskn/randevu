import { randomBytes } from "node:crypto";

/**
 * Spec satır 42 / CLAUDE.md §2: "Randevu detay/iptal linkleri sıralı ID değil,
 * kriptografik olarak rastgele token kullanır."
 *
 * 32 bayt = 256 bit entropi. base64url ile 43 karaktere kodlanır; URL'de
 * kaçış gerektiren karakter içermez (+ / = yok).
 */
const TOKEN_BAYT = 32;

export function publicTokenUret(): string {
  return randomBytes(TOKEN_BAYT).toString("base64url");
}
