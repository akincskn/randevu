import { BookingClient } from "@/components/public/booking-client";

/**
 * Public booking sayfası — spec satır 22 ("işletmenin public linkinden,
 * uygulama indirmeden, mobil web").
 *
 * Sunucu bileşeni kasıtlı olarak İNCE: veriyi kendisi çekmez. STRUCTURE.md
 * satır 59-60 public sayfaların Prisma'ya doğrudan erişmesini yasaklıyor; tüm
 * veri istemciden `api/` + DTO katmanına gider (bkz. `public-api.ts`).
 */
export default async function BookingPage({ params }: PageProps<"/[businessSlug]">) {
  const { businessSlug } = await params;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <BookingClient slug={businessSlug} />
    </main>
  );
}
