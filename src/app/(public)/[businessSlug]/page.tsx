import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { BULUNAMADI_BASLIGI } from "@/components/not-found-screen";
import { BookingClient } from "@/components/public/booking-client";
import type { BusinessPublicDto } from "@/lib/dto";

/**
 * Public booking sayfası — spec satır 22 ("işletmenin public linkinden,
 * uygulama indirmeden, mobil web").
 *
 * Sunucu bileşeni veriyi Prisma'dan DEĞİL `api/` + DTO katmanından okur
 * (STRUCTURE.md satır 78-79 page bileşenlerinin Prisma'ya erişmesini yasaklıyor).
 * Okuduğu tek şey işletmenin VAR OLUP OLMADIĞI: yoksa `notFound()` çağrılır,
 * böylece olmayan bir slug 200 değil 404 döner (Faz 7 QA gözlemi (a)).
 * Randevu akışının verisi hâlâ istemcide çekilir — `BookingClient` değişmedi.
 */

/** CLAUDE.md §2: tüm dış çağrılarda timeout zorunlu. */
const ZAMAN_ASIMI_MS = 10_000;

type IsletmeSonucu =
  | { durum: "var"; isletme: BusinessPublicDto }
  | { durum: "yok" }
  /** Sorulamadı (ağ/sunucu hatası, hız limiti). 404 VERİLMEZ — bkz. aşağıdaki not. */
  | { durum: "bilinmiyor" };

/**
 * İşletmeyi public API'den çözer.
 *
 * `cache()` ile sarılı: `generateMetadata` ve sayfanın kendisi aynı istekte
 * ikisi de çağırır, tek bir HTTP isteği yapılır.
 *
 * "bilinmiyor" durumu KASITLI olarak 404'e çevrilmez: API'ye ulaşılamadığı için
 * var olan bir işletmenin sayfasını 404 yapmak, geçici bir kesintiyi kalıcı bir
 * "dükkan yok" mesajına dönüştürürdü. O durumda sayfa render edilir ve istemci
 * kendi hata kutusunu gösterir (Turnstile/Upstash fail-open politikasıyla aynı yön).
 */
const isletmeCoz = cache(async (slug: string): Promise<IsletmeSonucu> => {
  const basliklar = await headers();
  const host = basliklar.get("host");
  if (!host) return { durum: "bilinmiyor" };

  const protokol =
    basliklar.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  try {
    const yanit = await fetch(
      `${protokol}://${host}/api/businesses/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) },
    );

    if (yanit.status === 404) return { durum: "yok" };
    if (!yanit.ok) return { durum: "bilinmiyor" };

    return { durum: "var", isletme: (await yanit.json()) as BusinessPublicDto };
  } catch (error) {
    // Sessizce yutulmaz (CLAUDE.md §2): loglanır, sayfa yine de açılır.
    console.error("[booking-page] işletme doğrulanamadı:", slug, error);
    return { durum: "bilinmiyor" };
  }
});

/**
 * Üç durumun ÜÇÜ DE ayrı ele alınır — ikisini birleştirmek iki ayrı hataya yol açmıştı:
 *
 *   var        -> işletmenin adı.
 *   yok        -> `not-found.tsx` ile BİREBİR AYNI başlık. Sayfa `notFound()` çağıracağı
 *                 için gövde o ekranı gösterir; başlığın farklı olması, sunucu HTML'i
 *                 "Sayfa bulunamadı" derken hydration sonrası sekmenin "İşletme
 *                 bulunamadı"ya dönmesine yol açıyordu. Ayrıca o ekran denenen yolun
 *                 bir işletme slug'ı olarak değerlendirildiğini AÇIK ETMEMELİ
 *                 (bkz. `not-found.tsx` yorumu) — gövde sadeyken başlık sızdırıyordu.
 *   bilinmiyor -> HİÇ başlık verilmez, kök layout'un varsayılanı miras alınır. Bu dalda
 *                 sayfa NORMAL render edilir (fail-open); "bulunamadı" başlığı, çalışan
 *                 bir randevu ekranının üstünde yanlış bilgi olurdu.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[businessSlug]">): Promise<Metadata> {
  const { businessSlug } = await params;
  const sonuc = await isletmeCoz(businessSlug);

  if (sonuc.durum === "yok") return { title: BULUNAMADI_BASLIGI };
  if (sonuc.durum === "bilinmiyor") return {};

  return {
    title: sonuc.isletme.name,
    description: `${sonuc.isletme.name} için online randevu alın.`,
  };
}

export default async function BookingPage({ params }: PageProps<"/[businessSlug]">) {
  const { businessSlug } = await params;

  if ((await isletmeCoz(businessSlug)).durum === "yok") {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <BookingClient slug={businessSlug} />
    </main>
  );
}
