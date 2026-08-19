"use client";

import Link from "next/link";

/**
 * Bekleyen randevu rozeti — spec satır 24 + 68.
 *
 * `shell.tsx`'ten AYRILDI: kabuk 203 satıra çıkmıştı ve CLAUDE.md §2 hand-authored
 * `src/` dosyaları için 200 satır sınırı koyuyor. Ayrım sorumluluk bazlı —
 * burada veri çekme veya oturum mantığı yok, yalnızca sayının gösterimi.
 *
 * Rozet SIFIRKEN DE gösterilir ama sakin renkte: spec "her zaman görünür" diyor,
 * bu şart yalnızca bekleyen varken göstermeyi dışlıyor.
 */
export function PendingBadge({ bekleyenSayisi }: { bekleyenSayisi: number }) {
  const bekleyenVar = bekleyenSayisi > 0;

  return (
    <Link
      href="/dashboard/appointments?scope=pending"
      className={`mb-5 flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 ${
        bekleyenVar
          ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
          : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
      }`}
    >
      <span className="font-semibold">
        {bekleyenVar ? `${bekleyenSayisi} randevu onayınızı bekliyor` : "Bekleyen randevu yok"}
      </span>
      <span
        aria-label={`${bekleyenSayisi} bekleyen randevu`}
        className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-lg font-bold tabular-nums ${
          bekleyenVar
            ? "bg-amber-500 text-white"
            : "bg-neutral-300 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
        }`}
      >
        {bekleyenSayisi}
      </span>
    </Link>
  );
}
