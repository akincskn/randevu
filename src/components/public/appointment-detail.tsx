"use client";

import { useEffect, useState } from "react";

import type { AppointmentDetailDto } from "@/lib/dto";
import { fiyatBicimle, saatBicimle, tarihSaatBicimle } from "@/lib/format";
import { PublicApiError, randevuGetir, randevuIptalEt } from "@/lib/public-api";

import { durumGorunumu } from "./appointment-status";
import { HataKutusu, Yukleniyor } from "./ui";

/**
 * Müşteri randevu detayı — spec satır 30 (saat, hizmet, adres) + satır 42
 * (`publicToken` ile iptal).
 *
 * İptal `window.confirm` KULLANMAZ: tarayıcı modal'ı sayfayı bloklar ve mobilde
 * kaza dokunuşuna açıktır. Yerine iki adımlı satır içi onay vardır.
 */
export function AppointmentDetail({ token }: { token: string }) {
  const [randevu, setRandevu] = useState<AppointmentDetailDto | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [onayBekliyor, setOnayBekliyor] = useState(false);
  const [iptalEdiliyor, setIptalEdiliyor] = useState(false);
  const [iptalHatasi, setIptalHatasi] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    randevuGetir(token)
      .then((veri) => {
        if (!iptal) setRandevu(veri);
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setHata(sorun instanceof PublicApiError ? sorun.message : "Randevu bilgisi alınamadı.");
      });
    return () => {
      iptal = true;
    };
  }, [token]);

  async function iptalEt(): Promise<void> {
    if (!randevu) return;
    setIptalEdiliyor(true);
    setIptalHatasi(null);
    try {
      setRandevu(await randevuIptalEt(randevu.id, token));
      setOnayBekliyor(false);
    } catch (sorun: unknown) {
      setIptalHatasi(
        sorun instanceof PublicApiError ? sorun.message : "Randevu iptal edilemedi.",
      );
    } finally {
      setIptalEdiliyor(false);
    }
  }

  if (hata) return <HataKutusu mesaj={hata} />;
  if (!randevu) return <Yukleniyor metin="Randevu yükleniyor…" />;

  const gorunum = durumGorunumu(randevu.status);
  const tz = randevu.business.timezone;
  const fiyat = fiyatBicimle(randevu.service.price);

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 px-4 py-3 ${gorunum.sinif}`}>
        <h1 className="text-lg font-bold">{gorunum.baslik}</h1>
        <p className="mt-1 text-sm">{gorunum.aciklama}</p>
      </div>

      <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        <Satir etiket="Tarih ve saat">
          <span className="font-medium">{tarihSaatBicimle(randevu.startsAt, tz)}</span>
          <span className="block text-sm opacity-70">
            Bitiş {saatBicimle(randevu.endsAt, tz)} · {randevu.service.durationMinutes} dk
          </span>
        </Satir>
        <Satir etiket="Hizmet">
          {randevu.service.name}
          {fiyat ? <span className="block text-sm opacity-70">{fiyat}</span> : null}
        </Satir>
        <Satir etiket="İşletme">
          {randevu.business.name}
          {randevu.business.address ? (
            <span className="block text-sm opacity-70">{randevu.business.address}</span>
          ) : null}
        </Satir>
        <Satir etiket="Adınıza">{randevu.customerName}</Satir>
      </dl>

      {iptalHatasi ? <HataKutusu mesaj={iptalHatasi} /> : null}

      {gorunum.iptalEdilebilir ? (
        <div className="space-y-2">
          {onayBekliyor ? (
            <>
              <p className="text-sm font-medium">Bu randevuyu iptal etmek istediğinize emin misiniz?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void iptalEt()}
                  disabled={iptalEdiliyor}
                  className="min-h-11 flex-1 rounded-xl bg-red-600 px-4 font-semibold text-white disabled:opacity-40"
                >
                  {iptalEdiliyor ? "İptal ediliyor…" : "Evet, iptal et"}
                </button>
                <button
                  type="button"
                  onClick={() => setOnayBekliyor(false)}
                  disabled={iptalEdiliyor}
                  className="min-h-11 flex-1 rounded-xl border-2 border-neutral-300 px-4 font-semibold disabled:opacity-40 dark:border-neutral-700"
                >
                  Vazgeç
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOnayBekliyor(true)}
              className="min-h-11 w-full rounded-xl border-2 border-red-300 px-4 font-semibold text-red-700 dark:border-red-900 dark:text-red-400"
            >
              Randevuyu iptal et
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {etiket}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
