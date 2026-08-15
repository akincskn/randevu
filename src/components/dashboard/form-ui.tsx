import type { ReactNode } from "react";

/**
 * Dashboard formlarının paylaşılan parçaları.
 *
 * Public taraftaki `components/public/ui.tsx`'ten AYRI: berber paneli masaüstünde
 * de kullanılır (esnaf dükkanda tablet/laptop kullanır), public sayfa ise saf
 * mobil-önce. İkisini tek bileşene zorlamak her iki tarafı da bozardı.
 */

export const ALAN_SINIFI =
  "min-h-11 w-full rounded-xl border-2 border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:focus:border-white";

export function Alan({
  id,
  etiket,
  ipucu,
  children,
}: {
  id: string;
  etiket: string;
  ipucu?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiket}
      </label>
      {children}
      {ipucu ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{ipucu}</p>
      ) : null}
    </div>
  );
}

export function Hata({ mesaj }: { mesaj: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {mesaj}
    </p>
  );
}

export function Basari({ mesaj }: { mesaj: string }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    >
      {mesaj}
    </p>
  );
}

export function AnaButon({
  children,
  disabled,
  type = "submit",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full rounded-xl bg-neutral-900 px-4 font-semibold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-900"
    >
      {children}
    </button>
  );
}

export function IkincilButon({
  children,
  disabled,
  onClick,
  tehlike = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tehlike?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-lg border-2 px-3 text-sm font-semibold transition-opacity disabled:opacity-40 ${
        tehlike
          ? "border-red-300 text-red-700 dark:border-red-900 dark:text-red-400"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

export function Yukleniyor({ metin }: { metin: string }) {
  return (
    <p aria-live="polite" className="text-sm text-neutral-500 dark:text-neutral-400">
      {metin}
    </p>
  );
}
