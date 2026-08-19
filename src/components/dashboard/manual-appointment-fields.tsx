"use client";

import type { ServiceAdminDto } from "@/lib/dto-dashboard";

import { Alan, ALAN_SINIFI } from "./form-ui";

/**
 * Manuel randevu formunun alanları — saf sunum katmanı.
 *
 * `manual-appointment-form.tsx`'ten AYRILDI: birleşik dosya 219 satıra çıkıyordu
 * ve CLAUDE.md §2 hand-authored src/ dosyaları için 200 satır sınırı koyuyor.
 * Ayrım keyfi değil sorumluluk bazlı: burada hiç istek/durum mantığı yoktur.
 */

export interface ManuelRandevuAlanlari {
  serviceId: string;
  gun: string;
  saat: string;
  ad: string;
  telefon: string;
}

export function ManualAppointmentFields({
  hizmetler,
  enErkenGun,
  degerler,
  degistir,
}: {
  hizmetler: ServiceAdminDto[];
  /** `<input type="date">` alt sınırı — işletmenin yerel bugünü. */
  enErkenGun: string;
  degerler: ManuelRandevuAlanlari;
  degistir: <A extends keyof ManuelRandevuAlanlari>(
    alan: A,
    deger: ManuelRandevuAlanlari[A],
  ) => void;
}) {
  return (
    <>
      <Alan id="manuel-hizmet" etiket="Hizmet">
        <select
          id="manuel-hizmet"
          value={degerler.serviceId}
          onChange={(olay) => degistir("serviceId", olay.target.value)}
          className={ALAN_SINIFI}
        >
          {hizmetler.map((hizmet) => (
            <option key={hizmet.id} value={hizmet.id}>
              {hizmet.name} ({hizmet.durationMinutes} dk)
            </option>
          ))}
        </select>
      </Alan>

      <div className="grid grid-cols-2 gap-3">
        <Alan id="manuel-gun" etiket="Tarih">
          <input
            id="manuel-gun"
            type="date"
            required
            min={enErkenGun}
            value={degerler.gun}
            onChange={(olay) => degistir("gun", olay.target.value)}
            className={ALAN_SINIFI}
          />
        </Alan>
        {/* Saat SERBEST: availability slotlarıyla sınırlı değil — çalışma saati
            bypass'ı (spec "Randevu akışı" madde 5) ancak böyle kullanılabilir. */}
        <Alan
          id="manuel-saat"
          etiket="Saat"
          ipucu="Çalışma saatleriniz dışında da seçebilirsiniz."
        >
          <input
            id="manuel-saat"
            type="time"
            required
            value={degerler.saat}
            onChange={(olay) => degistir("saat", olay.target.value)}
            className={ALAN_SINIFI}
          />
        </Alan>
      </div>

      <Alan id="manuel-ad" etiket="Müşteri adı">
        <input
          id="manuel-ad"
          type="text"
          required
          value={degerler.ad}
          onChange={(olay) => degistir("ad", olay.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="manuel-telefon" etiket="Telefon" ipucu="Örn. 0532 111 22 33">
        <input
          id="manuel-telefon"
          type="tel"
          required
          inputMode="tel"
          value={degerler.telefon}
          onChange={(olay) => degistir("telefon", olay.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>
    </>
  );
}
