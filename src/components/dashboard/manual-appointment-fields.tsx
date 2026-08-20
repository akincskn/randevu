"use client";

import { DatePicker } from "@/components/public/date-picker";
import { SlotPicker } from "@/components/public/slot-picker";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";

/**
 * Seçicinin ihtiyaç duyduğu ALT KÜME. Tam `ServiceAdminDto` istenmiyor çünkü
 * düzenleme formu, pasife alınmış bir hizmeti listeye sentetik olarak geri
 * ekleyebilmeli (o kayıt aktif hizmet listesinden gelmiyor).
 */
export type HizmetSecenegi = Pick<ServiceAdminDto, "id" | "name" | "durationMinutes">;
import type { MusaitlikDurumu } from "@/components/public/use-availability";

import { Alan, ALAN_SINIFI } from "./form-ui";

/**
 * Manuel randevu formunun alanları — saf sunum katmanı (istek/durum mantığı yok).
 *
 * Tarih ve saat seçicileri `components/public/`ten AYNEN ödünç alınır, kopyalanmaz:
 * kullanıcı kararı 2026-08-20 "müşterinin seçeceği gibi saatler çıksın, onunla
 * EŞDEĞER çalışmalı" diyor. Ayrı bir seçici yazılsaydı iki liste zamanla ayrışır
 * ve berber, müşteride görünmeyen bir saati seçebilir hale gelirdi. Panelin
 * `form-ui.tsx`'i public `ui.tsx`'ten ayrıdır ama BUNLAR seçici değil, aynı
 * müsaitlik verisinin görünümüdür.
 */

export interface ManuelRandevuAlanlari {
  serviceId: string;
  gun: string;
  /** Slot modunda seçili mutlak an (ISO). Saat dışı modunda kullanılmaz. */
  slot: string | null;
  /** Saat dışı modunda serbest girilen yerel duvar saati ("HH:MM"). */
  serbestSaat: string;
  saatDisiMod: boolean;
  ad: string;
  telefon: string;
}

export function ManualAppointmentFields({
  idOneki,
  saatDisiEtiket,
  hizmetler,
  gunler,
  timezone,
  musaitlik,
  degerler,
  degistir,
}: {
  /**
   * Alan `id`'lerinin öneki. Ekleme ve düzenleme formu AYNI anda açık olabilir;
   * sabit id kullanılsaydı sayfada mükerrer id oluşur ve `<label for>` yanlış
   * alana bağlanırdı (ekran okuyucu için de bozuk).
   */
  idOneki: string;
  /** Bypass anahtarının metni; ekleme ile düzenlemede farklı fiil gerekiyor. */
  saatDisiEtiket: string;
  hizmetler: HizmetSecenegi[];
  /** İşletmenin bugününden itibaren rezervasyon ufku kadar gün. */
  gunler: string[];
  timezone: string;
  musaitlik: MusaitlikDurumu;
  degerler: ManuelRandevuAlanlari;
  degistir: <A extends keyof ManuelRandevuAlanlari>(
    alan: A,
    deger: ManuelRandevuAlanlari[A],
  ) => void;
}) {
  return (
    <>
      <Alan id={`${idOneki}-hizmet`} etiket="Hizmet">
        <select
          id={`${idOneki}-hizmet`}
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

      <div className="space-y-1">
        <p className="text-sm font-medium">Tarih</p>
        {/* Geçmiş gün SEÇENEK OLARAK HİÇ ÜRETİLMEZ — şerit işletmenin bugününden
            başlar, yani "seçilemez" yapmaya gerek kalmadan zaten yoktur. */}
        <DatePicker
          gunler={gunler}
          seciliGun={degerler.gun}
          onSec={(isoGun) => degistir("gun", isoGun)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Saat</p>

        {degerler.saatDisiMod ? (
          <Alan
            id={`${idOneki}-serbest-saat`}
            etiket="Çalışma saati dışı saat"
            ipucu="Bu saat müsaitlik listesinde yok; çakışma olursa kayıt reddedilir."
          >
            <input
              id={`${idOneki}-serbest-saat`}
              type="time"
              required
              value={degerler.serbestSaat}
              onChange={(olay) => degistir("serbestSaat", olay.target.value)}
              className={ALAN_SINIFI}
            />
          </Alan>
        ) : (
          // Müşterinin gördüğü listenin AYNISI: dolu saatler ve geçmiş saatler
          // burada da elenmiş gelir, dolayısıyla çakışma seçilemez.
          <SlotPicker
            slotlar={musaitlik.slotlar}
            timezone={timezone}
            seciliSlot={degerler.slot}
            yukleniyor={musaitlik.yukleniyor}
            hata={musaitlik.hata}
            onSec={(isoAn) => degistir("slot", isoAn)}
          />
        )}

        {/* Spec madde 5'teki çalışma saati bypass'ı buradan erişilir: VARSAYILAN
            DEĞİL, bilinçli bir istisnadır (kullanıcı kararı, 2026-08-20). */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={degerler.saatDisiMod}
            onChange={(olay) => degistir("saatDisiMod", olay.target.checked)}
            className="h-4 w-4"
          />
          {saatDisiEtiket}
        </label>
      </div>

      <Alan id={`${idOneki}-ad`} etiket="Müşteri adı">
        <input
          id={`${idOneki}-ad`}
          type="text"
          required
          value={degerler.ad}
          onChange={(olay) => degistir("ad", olay.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id={`${idOneki}-telefon`} etiket="Telefon" ipucu="Örn. 0532 111 22 33">
        <input
          id={`${idOneki}-telefon`}
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
