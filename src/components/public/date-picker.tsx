"use client";

import { gunBicimle, gunKisaBicimle } from "@/lib/format";

import { SecimButonu } from "./ui";

/**
 * Tarih seçimi — yatay kaydırılabilir gün şeridi.
 *
 * Pencere `REZERVASYON_UFKU_GUN` (14 gün, kullanıcı kararı 2026-08-15) kadardır
 * ve işletmenin BUGÜN'ünden başlar; günler `booking-client` tarafından üretilir.
 *
 * Şerit yatay kayar ama SAYFA kaymaz (`overflow-x-auto` yalnızca bu kapsayıcıda) —
 * mobilde gövdenin yatay kayması okunabilirliği bozardı.
 */
export function DatePicker({
  gunler,
  seciliGun,
  onSec,
}: {
  gunler: string[];
  seciliGun: string | null;
  onSec: (isoGun: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {gunler.map((isoGun, sira) => {
          const { gunAdi, gunNo } = gunKisaBicimle(isoGun);
          return (
            <li key={isoGun}>
              <SecimButonu
                secili={isoGun === seciliGun}
                onClick={() => onSec(isoGun)}
                ariaLabel={gunBicimle(isoGun)}
                className="flex w-16 flex-col items-center justify-center gap-0.5 !px-2 text-center"
              >
                <span className="text-xs uppercase opacity-70">
                  {sira === 0 ? "Bugün" : gunAdi}
                </span>
                <span className="text-lg font-semibold tabular-nums leading-none">{gunNo}</span>
              </SecimButonu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
