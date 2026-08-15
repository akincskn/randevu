"use client";

import type { WorkingHoursDto } from "@/lib/dto-dashboard";
import { dakikaToSaat, GUN_ADLARI, saatToDakika } from "@/lib/minute-time";

import { ALAN_SINIFI } from "./form-ui";

/**
 * Haftalık çalışma saatleri düzenleyicisi — spec satır 18.
 *
 * Saatler YEREL duvar saatidir: "09:00'da açarım" yaz saati kuralı değişse bile
 * 09:00 kalmalı. Bu yüzden burada hiçbir saat dilimi dönüşümü YAPILMAZ; değerler
 * dakika olarak taşınır ve mutlak zamana çevrimi slot üreteci yapar.
 */
export function WeeklyHours({
  hafta,
  devreDisi,
  onDegis,
}: {
  hafta: WorkingHoursDto[];
  devreDisi: boolean;
  onDegis: (gun: number, degisiklik: Partial<WorkingHoursDto>) => void;
}) {
  return (
    <ul className="space-y-2">
      {hafta.map((gun) => (
        <li
          key={gun.dayOfWeek}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
        >
          <label className="flex min-w-32 items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={gun.isOpen}
              disabled={devreDisi}
              onChange={(o) => onDegis(gun.dayOfWeek, { isOpen: o.target.checked })}
              className="h-5 w-5"
            />
            {GUN_ADLARI[gun.dayOfWeek]}
          </label>

          {gun.isOpen ? (
            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label={`${GUN_ADLARI[gun.dayOfWeek]} açılış saati`}
                value={dakikaToSaat(gun.opensAtMinute)}
                disabled={devreDisi}
                onChange={(o) =>
                  onDegis(gun.dayOfWeek, { opensAtMinute: saatToDakika(o.target.value) })
                }
                className={`${ALAN_SINIFI} w-32`}
              />
              <span aria-hidden>–</span>
              <input
                type="time"
                aria-label={`${GUN_ADLARI[gun.dayOfWeek]} kapanış saati`}
                value={dakikaToSaat(gun.closesAtMinute)}
                disabled={devreDisi}
                onChange={(o) =>
                  onDegis(gun.dayOfWeek, { closesAtMinute: saatToDakika(o.target.value) })
                }
                className={`${ALAN_SINIFI} w-32`}
              />
            </div>
          ) : (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">Kapalı</span>
          )}
        </li>
      ))}
    </ul>
  );
}
