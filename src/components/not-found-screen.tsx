import Link from "next/link";

/**
 * 404 ekranı. Kök `app/not-found.tsx` bunu render eder; başlık sabiti ayrıca
 * `[businessSlug]/page.tsx`'in `generateMetadata`'sında kullanılır (iki yerde
 * farklı başlık, sunucu HTML'i ile hydration sonrası sekmenin ayrışmasına yol
 * açmıştı — Faz 7 sonrası QA, FAIL 2).
 *
 * ÖLÇÜLMÜŞ SINIR (Next.js 16.3.1): `notFound()` ile üretilen 404, kök layout'un
 * DIŞINDA render edilir — `<html id="__next_error__">`, yani `lang="tr"` ve font/
 * `h-full antialiased` sınıfları olmadan. `not-found.tsx`'i `(public)` grubuna veya
 * doğrudan `[businessSlug]` segmentine koymak sonucu DEĞİŞTİRMEDİ; hiçbir metadata
 * veya veri çekimi içermeyen, yalnızca `notFound()` çağıran boş bir test route'u da
 * aynı çıktıyı verdi. Yani bu uygulama kodundan değil framework'ten geliyor.
 * EŞLEŞMEYEN URL'lerin 404'ü (ör. /a/b/c) bundan etkilenmez, kök layout'u alır.
 * Tarayıcıda hydration sonrası `documentElement.lang` "tr"ye döner.
 *
 * Bilinçli olarak SADE: hangi kaynağın bulunamadığını yazmaz. Ziyaretçinin bir
 * işletme slug'ı mı yoksa rastgele bir yol mu denediği ayrımını sızdırmak, var olan
 * slug'ları taramayı kolaylaştırırdı. Aynı gerekçeyle BAŞLIK da tek ve nötrdür.
 */
export const BULUNAMADI_BASLIGI = "Sayfa bulunamadı";

export function NotFoundScreen() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{BULUNAMADI_BASLIGI}</h1>
      <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
        Aradığınız adres geçersiz veya kaldırılmış olabilir. Randevu bağlantınızı
        size gönderildiği şekilde açtığınızdan emin olun.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
