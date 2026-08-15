"use client";

import { saatBicimle } from "@/lib/format";

import { BilgiKutusu, HataKutusu, SecimButonu, Yukleniyor } from "./ui";

/**
 * Müsait saat seçimi — spec satır 22 ("uygun saati görür").
 *
 * Düz kronolojik ızgara, gruplama YOK (kullanıcı kararı, 2026-08-15).
 * Saatler işletmenin saat diliminde biçimlenir, ziyaretçinin cihazınınkinde değil.
 */
export function SlotPicker({
  slotlar,
  timezone,
  seciliSlot,
  yukleniyor,
  hata,
  onSec,
}: {
  slotlar: string[];
  timezone: string;
  seciliSlot: string | null;
  yukleniyor: boolean;
  hata: string | null;
  onSec: (isoAn: string) => void;
}) {
  if (yukleniyor) {
    return <Yukleniyor metin="Müsait saatler yükleniyor…" />;
  }

  if (hata) {
    return <HataKutusu mesaj={hata} />;
  }

  if (slotlar.length === 0) {
    return (
      <BilgiKutusu>
        Bu gün için müsait saat yok. Lütfen başka bir gün seçin.
      </BilgiKutusu>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slotlar.map((isoAn) => (
        <li key={isoAn}>
          <SecimButonu
            secili={isoAn === seciliSlot}
            onClick={() => onSec(isoAn)}
            className="w-full text-center font-medium tabular-nums"
          >
            {saatBicimle(isoAn, timezone)}
          </SecimButonu>
        </li>
      ))}
    </ul>
  );
}
