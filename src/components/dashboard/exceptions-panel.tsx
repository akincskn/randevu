"use client";

import { type FormEvent, useState } from "react";

import type { IstisnaGirdisi } from "@/lib/dashboard-api";
import type { ExceptionDto } from "@/lib/dto-dashboard";
import { gunBicimle } from "@/lib/format";
import { dakikaToSaat, saatToDakika } from "@/lib/minute-time";

import { Alan, ALAN_SINIFI, AnaButon, IkincilButon } from "./form-ui";

/**
 * Çalışma saati istisnaları — spec satır 19 ("bayram, izin günü").
 *
 * İstisna haftalık kaydı EZER; kaldırıldığında gün haftalık kayda geri döner.
 * Bu yüzden "kapalı" istisnasını silmek günü AÇAR — arayüz bunu metinle söyler.
 */
export function ExceptionsPanel({
  istisnalar,
  islemde,
  onEkle,
  onSil,
}: {
  istisnalar: ExceptionDto[];
  islemde: boolean;
  onEkle: (girdi: IstisnaGirdisi) => void;
  onSil: (id: string) => void;
}) {
  const [tarih, setTarih] = useState("");
  const [kapali, setKapali] = useState(true);
  const [acilis, setAcilis] = useState("09:00");
  const [kapanis, setKapanis] = useState("18:00");

  function gonder(olay: FormEvent<HTMLFormElement>): void {
    olay.preventDefault();
    onEkle({
      date: tarih,
      isClosed: kapali,
      opensAtMinute: kapali ? null : saatToDakika(acilis),
      closesAtMinute: kapali ? null : saatToDakika(kapanis),
    });
    setTarih("");
  }

  return (
    <div className="space-y-4">
      {istisnalar.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          Tanımlı istisna yok. Bayram veya izin günlerini buradan kapatabilirsiniz.
        </p>
      ) : (
        <ul className="space-y-2">
          {istisnalar.map((istisna) => (
            <li
              key={istisna.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
            >
              <div>
                <p className="font-medium">{gunBicimle(istisna.date)}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {istisna.isClosed
                    ? "Kapalı"
                    : `${dakikaToSaat(istisna.opensAtMinute)} – ${dakikaToSaat(istisna.closesAtMinute)}`}
                </p>
              </div>
              <IkincilButon tehlike disabled={islemde} onClick={() => onSil(istisna.id)}>
                Kaldır
              </IkincilButon>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={gonder}
        className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
        noValidate
      >
        <h3 className="font-semibold">İstisna ekle</h3>

        <Alan id="istisna-tarih" etiket="Tarih">
          <input
            id="istisna-tarih"
            type="date"
            required
            value={tarih}
            onChange={(o) => setTarih(o.target.value)}
            className={ALAN_SINIFI}
          />
        </Alan>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={kapali}
            onChange={(o) => setKapali(o.target.checked)}
            className="h-5 w-5"
          />
          Bu gün tamamen kapalı
        </label>

        {!kapali ? (
          <div className="grid grid-cols-2 gap-3">
            <Alan id="istisna-acilis" etiket="Açılış">
              <input
                id="istisna-acilis"
                type="time"
                value={acilis}
                onChange={(o) => setAcilis(o.target.value)}
                className={ALAN_SINIFI}
              />
            </Alan>
            <Alan id="istisna-kapanis" etiket="Kapanış">
              <input
                id="istisna-kapanis"
                type="time"
                value={kapanis}
                onChange={(o) => setKapanis(o.target.value)}
                className={ALAN_SINIFI}
              />
            </Alan>
          </div>
        ) : null}

        <AnaButon disabled={islemde || tarih === ""}>
          {islemde ? "Kaydediliyor…" : "İstisna ekle"}
        </AnaButon>
      </form>
    </div>
  );
}
