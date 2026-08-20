"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardApiError } from "@/lib/dashboard-api";
import {
  randevulariGetir,
  randevuIptalEt,
  randevuOnayla,
  type RandevuKapsami,
} from "@/lib/dashboard-api-appointments";
import type { AppointmentAdminDto } from "@/lib/dto-dashboard";
import { useSuAn } from "@/lib/use-now";

import { AppointmentEditForm } from "./appointment-edit-form";
import { AppointmentRow } from "./appointment-row";
import { Basari, Hata, Yukleniyor } from "./form-ui";
import { useKabuk } from "./shell-context";

/**
 * Randevu listesi + aksiyonlar — spec satır 24-26 ve 71.
 *
 * Onay yanıtındaki `whatsappUrl` YENİ SEKMEDE açılır: mesajı berber kendi
 * WhatsApp'ından MANUEL gönderir (spec satır 28-29). Otomatik gönderim yok,
 * WhatsApp Business API yok (satır 84 bunu kapsam dışı bırakıyor).
 */
export function AppointmentList({
  kapsam,
  bosMesaj,
  tarihGoster,
}: {
  kapsam: RandevuKapsami;
  bosMesaj: string;
  tarihGoster: boolean;
}) {
  const { rozetYenile, businessId } = useKabuk();
  // Tek sayaç tüm satırlara yeter — her satırın kendi `setInterval`'ı olmasın.
  const simdi = useSuAn();

  const [randevular, setRandevular] = useState<AppointmentAdminDto[] | null>(null);
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [hata, setHata] = useState<string | null>(null);
  const [islemdeki, setIslemdeki] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [yenileme, setYenileme] = useState(0);
  // AYNI ANDA TEK form açık: iki randevuyu paralel düzenlemek, ikisinin de aynı
  // slotu hedeflediği bir durumda hangisinin kazandığını takip edilemez kılardı.
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);

  const yenile = useCallback(() => setYenileme((n) => n + 1), []);

  useEffect(() => {
    let iptal = false;
    randevulariGetir(kapsam)
      .then((veri) => {
        if (iptal) return;
        setRandevular(veri.appointments);
        setTimezone(veri.timezone);
        setHata(null);
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setRandevular([]);
        setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevular alınamadı.");
      });
    return () => {
      iptal = true;
    };
  }, [kapsam, yenileme]);

  async function onayla(id: string): Promise<void> {
    setIslemdeki(id);
    setHata(null);
    setBilgi(null);
    try {
      setDuzenlenen(null);
      const sonuc = await randevuOnayla(id);
      // Yeni sekme: berberin paneli açık kalır, WhatsApp ayrı sekmede açılır.
      // `noopener` şart — açılan sayfa `window.opener` üzerinden panele erişemesin.
      window.open(sonuc.whatsappUrl, "_blank", "noopener,noreferrer");
      setBilgi("Randevu onaylandı. WhatsApp sekmesinden mesajı gönderin.");
      yenile();
      rozetYenile();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu onaylanamadı.");
    } finally {
      setIslemdeki(null);
    }
  }

  async function iptal(id: string): Promise<void> {
    setIslemdeki(id);
    setHata(null);
    setBilgi(null);
    try {
      setDuzenlenen(null);
      await randevuIptalEt(id);
      setBilgi("Randevu iptal edildi.");
      yenile();
      rozetYenile();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu iptal edilemedi.");
    } finally {
      setIslemdeki(null);
    }
  }

  if (randevular === null) {
    return <Yukleniyor metin="Randevular yükleniyor…" />;
  }

  return (
    <div className="space-y-3">
      {hata ? <Hata mesaj={hata} /> : null}
      {bilgi ? <Basari mesaj={bilgi} /> : null}

      {randevular.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {bosMesaj}
        </p>
      ) : (
        <ul className="space-y-2">
          {randevular.map((randevu) => (
            <AppointmentRow
              key={randevu.id}
              randevu={randevu}
              timezone={timezone}
              tarihGoster={tarihGoster}
              islemdeMi={islemdeki === randevu.id}
              simdi={simdi}
              duzenleniyorMu={duzenlenen === randevu.id}
              onOnayla={() => void onayla(randevu.id)}
              onIptal={() => void iptal(randevu.id)}
              onDuzenle={() =>
                setDuzenlenen((onceki) => (onceki === randevu.id ? null : randevu.id))
              }
            >
              {duzenlenen === randevu.id ? (
                <AppointmentEditForm
                  randevu={randevu}
                  businessId={businessId}
                  timezone={timezone}
                  onKapat={() => setDuzenlenen(null)}
                  onGuncellendi={() => {
                    // Form AÇIK kalır: WhatsApp bildirim linki yanıtla birlikte
                    // geliyor ve formu kapatmak onu görünmeden yok ederdi.
                    setBilgi("Randevu güncellendi.");
                    yenile();
                    rozetYenile();
                  }}
                />
              ) : null}
            </AppointmentRow>
          ))}
        </ul>
      )}
    </div>
  );
}
