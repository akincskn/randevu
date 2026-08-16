import Link from "next/link";

/**
 * Kök sayfa — create-next-app şablonunun yerini alır.
 *
 * `PROJECT_SPEC.md` bir tanıtım sayfası TANIMLAMIYOR. Bu ekran kullanıcı kararıyla
 * (2026-08-16) ve BİLİNÇLİ OLARAK DAR kapsamda yazıldı: yalnızca "burada ne var,
 * nereye gideceğim" sorusunu cevaplar. Hero görsel, özellik listesi, fiyatlandırma
 * bölümü KASITEN yoktur — spec'te olmayan bir pazarlama yüzeyi büyütmemek için.
 *
 * Müşteriler buraya değil, işletmenin kendi public linkine (`/[businessSlug]`)
 * gelir (spec satır 22); bu sayfanın hedef kitlesi berberdir.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Randevu</h1>

      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Berber ve kuaförler için ücretsiz, basit randevu sistemi.
      </p>

      <Link
        href="/register"
        className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 font-semibold text-white dark:bg-white dark:text-neutral-900"
      >
        Ücretsiz Kayıt Ol
      </Link>

      <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="font-semibold underline">
          Giriş Yap
        </Link>
      </p>
    </main>
  );
}
