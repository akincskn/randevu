"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { RandevuKapsami } from "@/lib/dashboard-api";

import { AppointmentList } from "./appointment-list";

const KAPSAMLAR: { deger: RandevuKapsami; etiket: string; bos: string }[] = [
  { deger: "pending", etiket: "Bekleyen", bos: "Onay bekleyen randevu yok." },
  { deger: "upcoming", etiket: "Yaklaşan", bos: "Yaklaşan randevu yok." },
  { deger: "today", etiket: "Bugün", bos: "Bugün için randevu yok." },
  { deger: "all", etiket: "Tümü", bos: "Henüz randevu yok." },
];

function kapsamCoz(ham: string | null): RandevuKapsami {
  const eslesen = KAPSAMLAR.find((k) => k.deger === ham);
  return eslesen ? eslesen.deger : "pending";
}

/**
 * Randevular sekmesi — spec satır 24.
 *
 * Başlangıç kapsamı URL'den okunur: layout'taki rozet
 * `/dashboard/appointments?scope=pending` adresine gidiyor ve tıklayan berber
 * doğrudan bekleyenleri görmeli. Sonrası yerel state'tir; her sekme değişiminde
 * URL'i güncellemek geri tuşunu gereksiz yere doldururdu.
 */
export function AppointmentsView() {
  const sorgu = useSearchParams();
  const [kapsam, setKapsam] = useState<RandevuKapsami>(() => kapsamCoz(sorgu.get("scope")));

  const aktif = KAPSAMLAR.find((k) => k.deger === kapsam) ?? KAPSAMLAR[0];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {KAPSAMLAR.map((secenek) => (
          <button
            key={secenek.deger}
            type="button"
            onClick={() => setKapsam(secenek.deger)}
            aria-pressed={secenek.deger === kapsam}
            className={`min-h-10 rounded-lg border-2 px-3 text-sm font-semibold ${
              secenek.deger === kapsam
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {secenek.etiket}
          </button>
        ))}
      </div>

      <AppointmentList
        // `key` şart: kapsam değiştiğinde liste state'i (hata/bilgi mesajları)
        // sıfırlanmalı, önceki sekmenin mesajı yeni sekmede kalmamalı.
        key={kapsam}
        kapsam={kapsam}
        tarihGoster
        bosMesaj={aktif.bos}
      />
    </section>
  );
}
