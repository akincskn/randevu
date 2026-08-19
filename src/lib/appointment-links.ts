/**
 * Müşteriye gönderilen randevu detay linkini üretir (spec satır 30).
 *
 * AYRI bir modülde duruyor çünkü iki ayrı route aynı adresi üretmek zorunda:
 * `PATCH /api/appointments/[id]/confirm` (public talebin onayı) ve
 * `POST /api/appointments/manual` (berberin elle eklediği randevu). İkisinin
 * ayrışması, WhatsApp'tan gönderilen linkin yine 404 vermesi demek olurdu —
 * bu hata Faz 3'te bir kez yaşandı (`/r/<token>` diye bir route hiç olmadı).
 *
 * Yol, sayfanın GERÇEK dosya yoluyla birebir aynı olmak ZORUNDA:
 * `src/app/(public)/[businessSlug]/appointment/[token]/page.tsx`
 */
export function randevuDetayUrl(
  isletmeSlug: string,
  publicToken: string,
  yedekOrigin: string,
): string {
  return new URL(
    `/${encodeURIComponent(isletmeSlug)}/appointment/${encodeURIComponent(publicToken)}`,
    process.env.NEXT_PUBLIC_APP_URL ?? yedekOrigin,
  ).toString();
}
