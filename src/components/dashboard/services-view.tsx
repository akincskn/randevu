"use client";

import { useEffect, useState } from "react";

import {
  DashboardApiError,
  hizmetGuncelle,
  hizmetleriGetir,
  hizmetOlustur,
  hizmetSil,
  type HizmetGirdisi,
} from "@/lib/dashboard-api";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";

import { Basari, Hata, Yukleniyor } from "./form-ui";
import { ServiceForm } from "./service-form";
import { ServiceRow } from "./service-row";

/**
 * Hizmet yönetimi sekmesi — spec satır 17.
 *
 * Pasif hizmetler burada GÖRÜNÜR (public sayfada görünmez): berber onları
 * tekrar aktifleştirebilmeli. Ayrım `isActive` alanındadır
 * (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-16).
 */
export function ServicesView() {
  const [hizmetler, setHizmetler] = useState<ServiceAdminDto[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [islemdeki, setIslemdeki] = useState<string | null>(null);
  const [yenileme, setYenileme] = useState(0);

  useEffect(() => {
    let iptal = false;
    hizmetleriGetir()
      .then((veri) => {
        if (iptal) return;
        setHizmetler(veri.services);
        setHata(null);
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setHizmetler([]);
        setHata(sorun instanceof DashboardApiError ? sorun.message : "Hizmetler alınamadı.");
      });
    return () => {
      iptal = true;
    };
  }, [yenileme]);

  /** Tüm yazma işlemlerinin ortak sarmalayıcısı — hata/bilgi yönetimi tek yerde. */
  async function calistir(
    anahtar: string,
    islem: () => Promise<unknown>,
    basariMesaji: string,
    varsayilanHata: string,
  ): Promise<void> {
    setIslemdeki(anahtar);
    setHata(null);
    setBilgi(null);
    try {
      await islem();
      setBilgi(basariMesaji);
      setYenileme((n) => n + 1);
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : varsayilanHata);
    } finally {
      setIslemdeki(null);
    }
  }

  const ekle = (girdi: HizmetGirdisi) =>
    void calistir("yeni", () => hizmetOlustur(girdi), "Hizmet eklendi.", "Hizmet eklenemedi.");

  const guncelle = (id: string, girdi: Partial<HizmetGirdisi>) =>
    void calistir(
      id,
      () => hizmetGuncelle(id, girdi),
      "Hizmet güncellendi.",
      "Hizmet güncellenemedi.",
    );

  const sil = (id: string) =>
    void calistir(id, () => hizmetSil(id), "Hizmet silindi.", "Hizmet silinemedi.");

  if (hizmetler === null) {
    return <Yukleniyor metin="Hizmetler yükleniyor…" />;
  }

  return (
    <section className="space-y-6">
      {hata ? <Hata mesaj={hata} /> : null}
      {bilgi ? <Basari mesaj={bilgi} /> : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Hizmetleriniz</h2>
        {hizmetler.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            Henüz hizmet eklemediniz. Müşterilerin randevu alabilmesi için en az bir hizmet
            gerekiyor.
          </p>
        ) : (
          <ul className="space-y-2">
            {hizmetler.map((hizmet) => (
              <ServiceRow
                key={hizmet.id}
                hizmet={hizmet}
                islemdeMi={islemdeki === hizmet.id}
                onGuncelle={(girdi) => guncelle(hizmet.id, girdi)}
                onSil={() => sil(hizmet.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Yeni hizmet ekle</h2>
        <ServiceForm
          // `key` şart: ekleme başarılı olunca form ALANLARI sıfırlansın,
          // önceki hizmetin adı yeni formda kalmasın.
          key={yenileme}
          gonderiliyor={islemdeki === "yeni"}
          onKaydet={ekle}
        />
      </div>
    </section>
  );
}
