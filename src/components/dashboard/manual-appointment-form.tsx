"use client";

import { useEffect, useState } from "react";

import { DashboardApiError, hizmetleriGetir, manuelRandevuOlustur } from "@/lib/dashboard-api";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";
import { mutlakAnHesapla } from "@/lib/timezone";

import { AnaButon, Basari, Hata, IkincilButon, Yukleniyor } from "./form-ui";
import {
  ManualAppointmentFields,
  type ManuelRandevuAlanlari,
} from "./manual-appointment-fields";

/**
 * Berberin panelden ELLE randevu eklediği form — spec "Randevu akışı" madde 5
 * (2026-08-19 kapsam eklentisi).
 *
 * Saat SERBEST girilir: public taraftaki gibi `GET /api/availability`ın ürettiği
 * slot listesiyle SINIRLI DEĞİLDİR. Sebebi spec'te yazılı bilinçli bypass'tır —
 * berber kapalı günde veya kapanıştan sonra da randevu yazabilmelidir; slot
 * listesi o saatleri hiç üretmezdi.
 *
 * Girilen tarih+saat İŞLETMENİN yerel duvar saatidir; API mutlak an beklediği için
 * `mutlakAnHesapla` ile çevrilir (slot üretecinin kullandığı fonksiyonun aynısı).
 */

/** İşletmenin yerel bugünü (YYYY-MM-DD) — tarih alanının alt sınırı. */
function bugunIsoGun(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ManualAppointmentForm({
  timezone,
  onOlusturuldu,
}: {
  timezone: string;
  /** Randevu yazıldıktan sonra listenin ve rozetin tazelenmesi için. */
  onOlusturuldu: () => void;
}) {
  const [hizmetler, setHizmetler] = useState<ServiceAdminDto[] | null>(null);
  const [degerler, setDegerler] = useState<ManuelRandevuAlanlari>(() => ({
    serviceId: "",
    gun: bugunIsoGun(timezone),
    saat: "",
    ad: "",
    telefon: "",
  }));

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  function degistir<A extends keyof ManuelRandevuAlanlari>(
    alan: A,
    deger: ManuelRandevuAlanlari[A],
  ): void {
    setDegerler((onceki) => ({ ...onceki, [alan]: deger }));
  }

  useEffect(() => {
    let iptal = false;
    hizmetleriGetir()
      .then((veri) => {
        if (iptal) return;
        // Pasif hizmetler DIŞARIDA: API de aynı kuralı zorluyor (kullanıcı kararı,
        // 2026-08-19). Listede gösterip 404 aldırmak yanıltıcı olurdu.
        const aktifler = veri.services.filter((hizmet) => hizmet.isActive);
        setHizmetler(aktifler);
        setDegerler((onceki) =>
          onceki.serviceId ? onceki : { ...onceki, serviceId: aktifler[0]?.id ?? "" },
        );
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setHizmetler([]);
        setHata(sorun instanceof DashboardApiError ? sorun.message : "Hizmetler alınamadı.");
      });
    return () => {
      iptal = true;
    };
  }, []);

  async function gonder(olay: React.FormEvent): Promise<void> {
    olay.preventDefault();
    setHata(null);
    setWhatsappUrl(null);

    const [saatBolumu, dakikaBolumu] = degerler.saat.split(":").map(Number);
    if (!Number.isInteger(saatBolumu) || !Number.isInteger(dakikaBolumu)) {
      setHata("Randevu saatini girin.");
      return;
    }

    // Yaz saati geçişindeki BOŞLUK: o duvar saati o gün hiç yaşanmaz ve mutlak bir
    // ana çevrilemez. Sessizce yanlış saate yazmak yerine açıkça reddedilir.
    const baslangic = mutlakAnHesapla(
      degerler.gun,
      saatBolumu * 60 + dakikaBolumu,
      timezone,
    );
    if (!baslangic) {
      setHata("Seçtiğiniz saat bu tarihte geçerli değil (saat değişimi). Başka bir saat seçin.");
      return;
    }

    setGonderiliyor(true);
    try {
      const sonuc = await manuelRandevuOlustur({
        serviceId: degerler.serviceId,
        customerName: degerler.ad,
        customerPhone: degerler.telefon,
        startsAt: baslangic.toISOString(),
      });
      // WhatsApp mesajı OPSİYONELDİR: link gösterilir, gönderme kararı berberindir.
      setWhatsappUrl(sonuc.whatsappUrl);
      setDegerler((onceki) => ({ ...onceki, ad: "", telefon: "", saat: "" }));
      onOlusturuldu();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu eklenemedi.");
    } finally {
      setGonderiliyor(false);
    }
  }

  if (hizmetler === null) {
    return <Yukleniyor metin="Hizmetler yükleniyor…" />;
  }

  if (hizmetler.length === 0) {
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
        hizmetler={hizmetler}
        enErkenGun={bugunIsoGun(timezone)}
        degerler={degerler}
        degistir={degistir}
      />

      <AnaButon disabled={gonderiliyor}>
        {gonderiliyor ? "Ekleniyor…" : "Randevuyu ekle"}
      </AnaButon>
    </form>
  );
}
