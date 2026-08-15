"use client";

import { type FormEvent, useState } from "react";

import type { HizmetGirdisi } from "@/lib/dashboard-api";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";

import { Alan, ALAN_SINIFI, AnaButon, IkincilButon } from "./form-ui";

/**
 * Hizmet ekleme/düzenleme formu — spec satır 17 (isim, süre, opsiyonel fiyat).
 *
 * Fiyat metin olarak taşınır: `number` kullanılsaydı JSON float'ı kuruş
 * hassasiyetini bozardı (DB tarafı `Decimal(10,2)`). Boş bırakmak "fiyat yok"
 * demektir ve `null` olarak gönderilir — spec fiyatı OPSİYONEL sayıyor.
 */
export function ServiceForm({
  mevcut,
  gonderiliyor,
  onKaydet,
  onVazgec,
}: {
  mevcut?: ServiceAdminDto;
  gonderiliyor: boolean;
  onKaydet: (girdi: HizmetGirdisi) => void;
  onVazgec?: () => void;
}) {
  const [ad, setAd] = useState(mevcut?.name ?? "");
  const [sure, setSure] = useState(String(mevcut?.durationMinutes ?? 30));
  const [fiyat, setFiyat] = useState(mevcut?.price ?? "");

  function gonder(olay: FormEvent<HTMLFormElement>): void {
    olay.preventDefault();
    onKaydet({
      name: ad.trim(),
      durationMinutes: Number(sure),
      price: fiyat.trim() === "" ? null : fiyat.trim(),
    });
  }

  const alanId = mevcut ? `duzenle-${mevcut.id}` : "yeni";

  return (
    <form onSubmit={gonder} className="space-y-3" noValidate>
      <Alan id={`${alanId}-ad`} etiket="Hizmet adı">
        <input
          id={`${alanId}-ad`}
          required
          maxLength={80}
          value={ad}
          onChange={(o) => setAd(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <div className="grid grid-cols-2 gap-3">
        <Alan id={`${alanId}-sure`} etiket="Süre (dakika)">
          <input
            id={`${alanId}-sure`}
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={1440}
            value={sure}
            onChange={(o) => setSure(o.target.value)}
            className={ALAN_SINIFI}
          />
        </Alan>

        <Alan id={`${alanId}-fiyat`} etiket="Fiyat (opsiyonel)">
          <input
            id={`${alanId}-fiyat`}
            inputMode="decimal"
            placeholder="250"
            value={fiyat}
            onChange={(o) => setFiyat(o.target.value)}
            className={ALAN_SINIFI}
          />
        </Alan>
      </div>

      <div className="flex gap-2">
        <AnaButon disabled={gonderiliyor}>
          {gonderiliyor ? "Kaydediliyor…" : mevcut ? "Kaydet" : "Hizmet ekle"}
        </AnaButon>
        {onVazgec ? (
          <IkincilButon disabled={gonderiliyor} onClick={onVazgec}>
            Vazgeç
          </IkincilButon>
        ) : null}
      </div>
    </form>
  );
}
