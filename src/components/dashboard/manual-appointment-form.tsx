"use client";

import { useState } from "react";

import { DashboardApiError } from "@/lib/dashboard-api";
import { manuelRandevuOlustur } from "@/lib/dashboard-api-appointments";
import { yerelAnHesapla } from "@/lib/timezone";

import { AnaButon, Basari, Hata, IkincilButon, Yukleniyor } from "./form-ui";
import { ManualAppointmentFields } from "./manual-appointment-fields";
import { useRandevuFormu } from "./use-appointment-form";

/**
 * Berberin panelden ELLE randevu eklediği form — spec "Randevu akışı" madde 5.
 *
 * SAAT SEÇİMİ MÜŞTERİ AKIŞIYLA EŞDEĞERDİR (kullanıcı kararı, 2026-08-20):
 * varsayılan olarak `GET /api/availability`ın ürettiği slot ızgarası gösterilir —
 * müşterinin gördüğü listenin AYNISI, aynı hook ve aynı bileşenle. Dolu ve geçmiş
 * saatler zaten elenmiş geldiği için normal akışta çakışan bir saat seçilemez.
 *
 * Çalışma saati bypass'ı KALDIRILMADI, VARSAYILAN OLMAKTAN ÇIKARILDI: "çalışma
 * saati dışına randevu ekle" anahtarı açılınca serbest saat alanı belirir.
 *
 * Alan durumu ve saat hesabı `use-appointment-form.ts`'tedir; düzenleme formuyla
 * ORTAKTIR. Bu dosyada yalnızca "yeni kayıt oluştur" isteği ve sonrası kalır.
 */
export function ManualAppointmentForm({
  businessId,
  timezone,
  onOlusturuldu,
}: {
  businessId: string;
  timezone: string;
  /** Randevu yazıldıktan sonra listenin ve rozetin tazelenmesi için. */
  onOlusturuldu: () => void;
}) {
  const form = useRandevuFormu({
    businessId,
    timezone,
    ilkDegerler: () => ({
      serviceId: "",
      gun: yerelAnHesapla(new Date(), timezone).isoGun,
      slot: null,
      serbestSaat: "",
      saatDisiMod: false,
      ad: "",
      telefon: "",
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
      const yanit = await manuelRandevuOlustur({
        serviceId: form.degerler.serviceId,
        customerName: form.degerler.ad,
        customerPhone: form.degerler.telefon,
        startsAt: sonuc.an.toISOString(),
      });
      // WhatsApp mesajı OPSİYONELDİR: link gösterilir, gönderme kararı berberindir.
      setWhatsappUrl(yanit.whatsappUrl);
      form.yamala({ ad: "", telefon: "", serbestSaat: "", slot: null });
      onOlusturuldu();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu eklenemedi.");
    } finally {
      // Başarıda da retde de liste tazelenir: yeni kayıt slotu kapatmış olabilir
      // (409 SLOT_TAKEN durumunda ise başka bir randevu kapatmıştır). Bayat liste
      // dolu bir saati tekrar seçtirirdi.
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

  if (form.hizmetler.liste.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-200 px-4 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        Önce en az bir aktif hizmet tanımlamalısınız.
      </p>
    );
  }

  return (
    <form
      onSubmit={(olay) => void gonder(olay)}
      className="space-y-3 rounded-xl border-2 border-neutral-200 p-4 dark:border-neutral-800"
    >
      {hata ? <Hata mesaj={hata} /> : null}

      {whatsappUrl ? (
        <div className="space-y-2">
          <Basari mesaj="Randevu eklendi ve onaylandı olarak kaydedildi." />
          <IkincilButon onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}>
            WhatsApp&apos;tan onay gönder
          </IkincilButon>
        </div>
      ) : null}

      <ManualAppointmentFields
        idOneki="manuel"
        saatDisiEtiket="Çalışma saati dışına randevu ekle"
        hizmetler={form.hizmetler.liste}
        gunler={form.gunler}
        timezone={timezone}
        musaitlik={form.musaitlik}
        degerler={form.degerler}
        degistir={(alan, deger) => {
          form.degistir(alan, deger);
          setHata(null);
        }}
      />

      <AnaButon disabled={gonderiliyor}>
        {gonderiliyor ? "Ekleniyor…" : "Randevuyu ekle"}
      </AnaButon>
    </form>
  );
}
