import type { Metadata } from "next";
import { AppointmentDetail } from "@/components/public/appointment-detail";

/**
 * Bu sayfa arama motorlarına KAPALIDIR. Geçersiz bir `publicToken` için `notFound()`
 * ÇAĞRILMAZ: slug'dan farklı olarak token tahmin edilemez, dolayısıyla geçersiz token
 * "sayfa yok" değil "kayıt yok" demektir. Sayfa 200 döner, istemci tarafındaki
 * "Randevu bulunamadı." mesajı gösterilir, `robots: { index: false }` ile de indekslenmez.
 * Karşılaştırma: olmayan işletme slug'ı gerçekten 404'tür.
 */
export function generateMetadata(): Metadata {
  return { title: "Randevu detayı", robots: { index: false } };
}

/**
 * Müşteri randevu detay ekranı — spec satır 30 ("saat, hizmet, adres").
 *
 * Adresteki `token`, spec satır 71'deki kriptografik rastgele `publicToken`'dır;
 * sıralı id DEĞİLDİR. Yetkilendirme token'ın kendisidir — hesap yoktur (satır 79).
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
