import { AppointmentDetail } from "@/components/public/appointment-detail";

/**
 * Müşteri randevu detay ekranı — spec satır 30 ("saat, hizmet, adres").
 *
 * Adresteki `token`, spec satır 42'deki kriptografik rastgele `publicToken`'dır;
 * sıralı id DEĞİLDİR. Yetkilendirme token'ın kendisidir — hesap yoktur (satır 50).
 *
 * Aynı ekran iki yoldan açılır: randevu oluşturulduktan sonraki yönlendirme ve
 * berberin WhatsApp'tan gönderdiği link. Tek kod yolu, tek görünüm.
 */
export default async function AppointmentPage({
  params,
}: PageProps<"/[businessSlug]/appointment/[token]">) {
  const { token } = await params;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <AppointmentDetail token={token} />
    </main>
  );
}
