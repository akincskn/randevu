"use client";

import { useEffect, useState } from "react";

import {
  calismaSaatleriGetir,
  calismaSaatleriKaydet,
  DashboardApiError,
  istisnaKaydet,
  istisnalariGetir,
  istisnaSil,
  type IstisnaGirdisi,
} from "@/lib/dashboard-api";
import type { ExceptionDto, WorkingHoursDto } from "@/lib/dto-dashboard";

import { AnaButon, Basari, Hata, Yukleniyor } from "./form-ui";
import { ExceptionsPanel } from "./exceptions-panel";
import { WeeklyHours } from "./weekly-hours";

/**
 * Çalışma saatleri sekmesi — spec satır 18 (haftalık) + satır 19 (istisnalar).
 *
 * Hafta TEK SEFERDE kaydedilir (`PUT /api/working-hours`): yedi ayrı istek
 * ortada kalırsa "salı yeni, çarşamba eski" gibi tutarsız bir haftaya yol açardı.
 */
export function HoursView() {
  const [hafta, setHafta] = useState<WorkingHoursDto[] | null>(null);
  const [istisnalar, setIstisnalar] = useState<ExceptionDto[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);
  const [yenileme, setYenileme] = useState(0);

  useEffect(() => {
    let iptal = false;
    Promise.all([calismaSaatleriGetir(), istisnalariGetir()])
      .then(([saatler, istisnaVeri]) => {
        if (iptal) return;
        setHafta(saatler.workingHours);
        setIstisnalar(istisnaVeri.exceptions);
        setHata(null);
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setHafta([]);
        setHata(
          sorun instanceof DashboardApiError ? sorun.message : "Çalışma saatleri alınamadı.",
        );
      });
    return () => {
      iptal = true;
    };
  }, [yenileme]);

  function gunDegis(gun: number, degisiklik: Partial<WorkingHoursDto>): void {
    setHafta((onceki) =>
      onceki === null
        ? onceki
        : onceki.map((k) => (k.dayOfWeek === gun ? { ...k, ...degisiklik } : k)),
    );
  }

  async function calistir(
    islem: () => Promise<unknown>,
    basariMesaji: string,
    varsayilanHata: string,
  ): Promise<void> {
    setIslemde(true);
    setHata(null);
    setBilgi(null);
    try {
      await islem();
      setBilgi(basariMesaji);
      setYenileme((n) => n + 1);
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : varsayilanHata);
    } finally {
      setIslemde(false);
    }
  }

  if (hafta === null) {
    return <Yukleniyor metin="Çalışma saatleri yükleniyor…" />;
  }

  return (
    <section className="space-y-6">
      {hata ? <Hata mesaj={hata} /> : null}
      {bilgi ? <Basari mesaj={bilgi} /> : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Haftalık çalışma saatleri</h2>
        <WeeklyHours hafta={hafta} devreDisi={islemde} onDegis={gunDegis} />
        <AnaButon
          type="button"
          disabled={islemde}
          onClick={() =>
            void calistir(
              () => calismaSaatleriKaydet(hafta),
              "Çalışma saatleri kaydedildi.",
              "Çalışma saatleri kaydedilemedi.",
            )
          }
        >
          {islemde ? "Kaydediliyor…" : "Haftayı kaydet"}
        </AnaButon>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">İstisna günler</h2>
        <ExceptionsPanel
          istisnalar={istisnalar}
          islemde={islemde}
          onEkle={(girdi: IstisnaGirdisi) =>
            void calistir(
              () => istisnaKaydet(girdi),
              "İstisna kaydedildi.",
              "İstisna kaydedilemedi.",
            )
          }
          onSil={(id) =>
            void calistir(() => istisnaSil(id), "İstisna kaldırıldı.", "İstisna kaldırılamadı.")
          }
        />
      </div>
    </section>
  );
}
