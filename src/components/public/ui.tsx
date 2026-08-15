import type { ReactNode } from "react";

/**
 * Public sayfaların paylaşılan görsel parçaları.
 *
 * Mobil web önce (spec satır 22: "uygulama indirmeden, mobil web"): dokunma
 * hedefleri en az 44px yüksekliğinde, tek sütun akış, yatay kaydırma yok.
 */

export function Bolum({
  baslik,
  adim,
  children,
}: {
  baslik: string;
  adim: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
          {adim}
        </span>
        {baslik}
      </h2>
      {children}
    </section>
  );
}

export function HataKutusu({ mesaj }: { mesaj: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {mesaj}
    </p>
  );
}

export function BilgiKutusu({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      {children}
    </p>
  );
}

export function Yukleniyor({ metin }: { metin: string }) {
  return (
    <p aria-live="polite" className="text-sm text-neutral-500 dark:text-neutral-400">
      {metin}
    </p>
  );
}

/**
 * Seçilebilir kart/pastil butonu. `secili` durumu SADECE renkle değil, kalın
 * çerçeve ve `aria-pressed` ile de bildirilir — renk körlüğü ve ekran okuyucu için.
 */
export function SecimButonu({
  secili,
  onClick,
  children,
  className = "",
  ariaLabel,
}: {
  secili: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      aria-label={ariaLabel}
      className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
        secili
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
      } ${className}`}
    >
      {children}
    </button>
  );
}
