"use client";

import { useState } from "react";

import type { HizmetGirdisi } from "@/lib/dashboard-api";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";
import { fiyatBicimle } from "@/lib/format";

import { IkincilButon } from "./form-ui";
import { ServiceForm } from "./service-form";

/**
 * Panelde tek bir hizmet satırı.
 *
 * Silme butonu randevusu olan hizmetlerde de GÖSTERİLİR (kullanıcı kararı,
 * 2026-08-16): gizlemek, berberin neden silemediğini anlamamasına yol açardı.
 * Sunucu 409 ile reddeder ve pasife almayı önerir. İki adımlı onay kullanılır;
 * `window.confirm` kasıtlı olarak KULLANILMAZ (sayfayı bloklar).
 */
export function ServiceRow({
  hizmet,
  islemdeMi,
  onGuncelle,
  onSil,
}: {
  hizmet: ServiceAdminDto;
  islemdeMi: boolean;
  onGuncelle: (girdi: Partial<HizmetGirdisi>) => void;
  onSil: () => void;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [silOnayi, setSilOnayi] = useState(false);

  if (duzenleniyor) {
    return (
      <li className="rounded-xl border-2 border-neutral-900 px-4 py-3 dark:border-white">
        <ServiceForm
          mevcut={hizmet}
          gonderiliyor={islemdeMi}
          onKaydet={(girdi) => {
            onGuncelle(girdi);
            setDuzenleniyor(false);
          }}
          onVazgec={() => setDuzenleniyor(false)}
        />
      </li>
    );
  }

  const fiyat = fiyatBicimle(hizmet.price);

  return (
    <li
      className={`rounded-xl border px-4 py-3 dark:border-neutral-800 ${
        hizmet.isActive ? "border-neutral-200" : "border-neutral-200 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {hizmet.name}
            {!hizmet.isActive ? (
              <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Pasif
              </span>
            ) : null}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {hizmet.durationMinutes} dk{fiyat ? ` · ${fiyat}` : ""}
            {hizmet.appointmentCount > 0 ? ` · ${hizmet.appointmentCount} randevu` : ""}
          </p>
        </div>
      </div>

      {silOnayi ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">Bu hizmeti silmek istediğinize emin misiniz?</p>
          <div className="flex flex-wrap gap-2">
            <IkincilButon tehlike disabled={islemdeMi} onClick={onSil}>
              {islemdeMi ? "Siliniyor…" : "Evet, sil"}
            </IkincilButon>
            <IkincilButon disabled={islemdeMi} onClick={() => setSilOnayi(false)}>
              Vazgeç
            </IkincilButon>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <IkincilButon disabled={islemdeMi} onClick={() => setDuzenleniyor(true)}>
            Düzenle
          </IkincilButon>
          <IkincilButon
            disabled={islemdeMi}
            onClick={() => onGuncelle({ isActive: !hizmet.isActive })}
          >
            {hizmet.isActive ? "Pasife al" : "Aktifleştir"}
          </IkincilButon>
          <IkincilButon tehlike disabled={islemdeMi} onClick={() => setSilOnayi(true)}>
            Sil
          </IkincilButon>
        </div>
      )}
    </li>
  );
}
