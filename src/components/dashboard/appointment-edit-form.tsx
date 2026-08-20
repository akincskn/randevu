"use client";

import { useState } from "react";

import { DashboardApiError } from "@/lib/dashboard-api";
import { randevuGuncelle } from "@/lib/dashboard-api-appointments";
import type { AppointmentAdminDto } from "@/lib/dto-dashboard";
import { saatBicimle, tarihSaatBicimle } from "@/lib/format";
import { yerelAnHesapla } from "@/lib/timezone";

import { AnaButon, Basari, Hata, IkincilButon, Yukleniyor } from "./form-ui";
import {
  type HizmetSecenegi,
  ManualAppointmentFields,
} from "./manual-appointment-fields";
import { useRandevuFormu } from "./use-appointment-form";

/**
 * Randevu düzenleme formu (kullanıcı kararı, 2026-08-20).
 *
 * Alanlar ve saat seçimi ekleme formuyla ORTAK hook üzerinden gelir
 * (`use-appointment-form.ts`) — berberin gördüğü saat listesi iki ekranda da
 * müşterininkiyle aynı olsun diye.
 *
 * Düzenlemeye ÖZGÜ iki nokta:
 *   1. Müsaitlik sorgusu bu randevuyu HARİÇ TUTAR: kendi saatini kendisi
 *      kapatıyor olurdu, o zaman berber saati koruyup yalnızca hizmeti
 *      değiştiremezdi.
 *   2. Randevunun mevcut saati üstte METİN olarak yazar. Slot ızgarası yalnızca
 *      çalışma saati içindeki saatleri üretir; randevu bypass ile kapalı bir
 *      saate yazılmışsa ızgarada görünmez ve seçili görünmemesi kafa karıştırır.
 *
 * Durum (PENDING/CONFIRMED) BURADAN DEĞİŞMEZ — onay ve iptal kendi butonlarında.
 */
export function AppointmentEditForm({
  randevu,
  businessId,
  timezone,
  onKapat,
  onGuncellendi,
}: {
  randevu: AppointmentAdminDto;
  businessId: string;
  timezone: string;
  onKapat: () => void;
  /** Kayıt sonrası listenin ve rozetin tazelenmesi için. */
  onGuncellendi: () => void;
}) {
  const form = useRandevuFormu({
    businessId,
    timezone,
    haricRandevuId: randevu.id,
    ilkDegerler: () => ({
      serviceId: randevu.service.id,
      gun: yerelAnHesapla(new Date(randevu.startsAt), timezone).isoGun,
      slot: randevu.startsAt,
      serbestSaat: saatBicimle(randevu.startsAt, timezone),
      saatDisiMod: false,
      ad: randevu.customerName,
      telefon: randevu.customerPhone,
    }),
  });

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  async function gonder(olay: React.FormEvent): Promise<void> {
    olay.preventDefault();
    setHata(null);
    setWhatsappUrl(null);

    const sonuc = form.baslangicHesapla();
    if ("sorun" in sonuc) {
      setHata(sonuc.sorun);
      return;
    }

    setGonderiliyor(true);
    try {
      // TÜM alanlar gönderilir, yalnızca değişenler değil: form zaten mevcut
      // değerlerle doludur ve "değişeni bul" mantığı, aynı sonucu üretirken
      // sessizce yanlış alanı atlama riskini taşırdı.
      const yanit = await randevuGuncelle(randevu.id, {
        serviceId: form.degerler.serviceId,
        customerName: form.degerler.ad,
        customerPhone: form.degerler.telefon,
        startsAt: sonuc.an.toISOString(),
      });
      setWhatsappUrl(yanit.whatsappUrl);
      onGuncellendi();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu güncellenemedi.");
    } finally {
      // Başarıda da retde de liste tazelenir: bu arada başka bir kayıt slotu
      // kapatmış olabilir (409 SLOT_TAKEN'ın tipik sebebi).
      form.musaitlik.yenile();
      setGonderiliyor(false);
    }
  }

  if (form.hizmetler.liste === null) {
    return <Yukleniyor metin="Hizmetler yükleniyor…" />;
  }

  if (form.hizmetler.hata) {
    return <Hata mesaj={form.hizmetler.hata} />;
  }

  // Randevunun hizmeti bu arada PASİFE alınmış olabilir (hizmet silinemez, bkz.
  // PROJECT_SPEC.md 2026-08-16). Aktif liste onu içermez; eklenmezse seçici boş
  // görünür ve berber ne seçili olduğunu göremez. Sentetik seçenek yalnızca
  // GÖRÜNÜM içindir — sunucu, hizmet değişmediyse `isActive` kontrolü yapmaz.
  const hizmetSecenekleri: HizmetSecenegi[] = form.hizmetler.liste.some(
    (hizmet) => hizmet.id === randevu.service.id,
  )
    ? form.hizmetler.liste
    : [
        {
          id: randevu.service.id,
          name: `${randevu.service.name} (pasif)`,
          durationMinutes: randevu.service.durationMinutes,
        },
        ...form.hizmetler.liste,
      ];

  return (
    <form
      onSubmit={(olay) => void gonder(olay)}
      className="mt-3 space-y-3 rounded-xl border-2 border-neutral-200 p-4 dark:border-neutral-800"
    >
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Mevcut randevu: {tarihSaatBicimle(randevu.startsAt, timezone)} ·{" "}
        {randevu.service.name}
      </p>

      {hata ? <Hata mesaj={hata} /> : null}

      {whatsappUrl ? (
        <div className="space-y-2">
          <Basari mesaj="Randevu güncellendi." />
          <IkincilButon onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}>
            WhatsApp&apos;tan değişikliği bildir
          </IkincilButon>
        </div>
      ) : null}

      <ManualAppointmentFields
        idOneki={`duzenle-${randevu.id}`}
        saatDisiEtiket="Çalışma saati dışına taşı"
        hizmetler={hizmetSecenekleri}
        gunler={form.gunler}
        timezone={timezone}
        musaitlik={form.musaitlik}
        degerler={form.degerler}
        degistir={(alan, deger) => {
          form.degistir(alan, deger);
          setHata(null);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <AnaButon disabled={gonderiliyor}>
          {gonderiliyor ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
        </AnaButon>
        <IkincilButon disabled={gonderiliyor} onClick={onKapat}>
          Vazgeç
        </IkincilButon>
      </div>
    </form>
  );
}
