"use client";

import type { ServicePublicDto } from "@/lib/dto";
import { fiyatBicimle } from "@/lib/format";

import { BilgiKutusu, SecimButonu } from "./ui";

/**
 * Hizmet seçimi — spec satır 22 ("müşteri ... hizmet seçer").
 *
 * Fiyat SADECE bilgi amaçlı gösterilir; online ödeme v1 kapsamı DIŞINDADIR
 * (spec satır 17 ve 56). Bu yüzden hiçbir yerde "öde/sepet" eylemi yoktur.
 */
export function ServicePicker({
  hizmetler,
  seciliId,
  onSec,
}: {
  hizmetler: ServicePublicDto[];
  seciliId: string | null;
  onSec: (hizmet: ServicePublicDto) => void;
}) {
  if (hizmetler.length === 0) {
    return <BilgiKutusu>Bu işletme henüz hizmet tanımlamamış.</BilgiKutusu>;
  }

  return (
    <ul className="space-y-2">
      {hizmetler.map((hizmet) => {
        const fiyat = fiyatBicimle(hizmet.price);
        return (
          <li key={hizmet.id}>
            <SecimButonu
              secili={hizmet.id === seciliId}
              onClick={() => onSec(hizmet)}
              className="flex w-full items-center justify-between gap-3"
            >
              <span className="font-medium">{hizmet.name}</span>
              <span className="shrink-0 text-sm tabular-nums opacity-80">
                {hizmet.durationMinutes} dk{fiyat ? ` · ${fiyat}` : ""}
              </span>
            </SecimButonu>
          </li>
        );
      })}
    </ul>
  );
}
