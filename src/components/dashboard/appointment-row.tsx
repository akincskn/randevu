"use client";

import type { AppointmentAdminDto } from "@/lib/dto-dashboard";
import { saatBicimle, tarihSaatBicimle } from "@/lib/format";

import { IkincilButon } from "./form-ui";

/**
 * Panelde tek bir randevu satırı.
 *
 * Durum SADECE renkle değil METİNLE de bildirilir (renk körlüğü + ekran okuyucu).
 * Aksiyonlar spec satır 25-26 (onayla) ve satır 71 (iptal) ile sınırlıdır.
 * COMPLETED işaretlemesini cron yapar (`lib/completion-sweep.ts`); berber elle
 * COMPLETED/NO_SHOW yazamaz (kullanıcı kararı, 2026-08-20).
 */

const DURUM_METNI: Record<AppointmentAdminDto["status"], string> = {
  PENDING: "Onay bekliyor",
  CONFIRMED: "Onaylandı",
  CANCELLED: "İptal edildi",
  EXPIRED: "Süresi doldu",
  COMPLETED: "Tamamlandı",
  NO_SHOW: "Gelinmedi",
};

const DURUM_SINIFI: Record<AppointmentAdminDto["status"], string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  CONFIRMED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  CANCELLED: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  EXPIRED: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  COMPLETED: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  NO_SHOW: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function AppointmentRow({
  randevu,
  timezone,
  tarihGoster,
  islemdeMi,
  simdi,
  duzenleniyorMu,
  onOnayla,
  onIptal,
  onDuzenle,
  children,
}: {
  randevu: AppointmentAdminDto;
  timezone: string;
  tarihGoster: boolean;
  islemdeMi: boolean;
  /** Liste tarafından üretilen "şu an" damgası; `null` ise henüz bilinmiyor. */
  simdi: number | null;
  /** Bu satırın düzenleme formu açık mı — buton metni ve `aria-expanded` için. */
  duzenleniyorMu: boolean;
  onOnayla: () => void;
  onIptal: () => void;
  onDuzenle: () => void;
  /** Açıkken satırın altına yerleşen düzenleme formu. */
  children?: React.ReactNode;
}) {
  // Geçmiş randevuya aksiyon gösterilmez. Eşikler cron'un kullandığı kurallarla
  // BİREBİR aynıdır — panelin ve süpürmenin farklı şeye "geçmiş" demesi, aradaki
  // 15 dakikalık cron boşluğunda tıklanan bir butonun 409 ile dönmesi demekti:
  //   - onay eşiği `startsAt` (expiry.ts: saati geçen PENDING randevu EXPIRED olur),
  //   - iptal eşiği `endsAt` (completion-sweep.ts: biten CONFIRMED randevu COMPLETED olur;
  //     randevu SÜRERKEN berber hâlâ iptal edebilmeli).
  // `simdi` henüz yoksa (ilk render) randevu GEÇMİŞ sayılır: aksiyonu bir kare
  // geç göstermek, geçmiş randevuda buton göstermekten iyidir.
  const baslamisMi = simdi === null || Date.parse(randevu.startsAt) <= simdi;
  const bitmisMi = simdi === null || Date.parse(randevu.endsAt) <= simdi;

  const onaylanabilir = randevu.status === "PENDING" && !baslamisMi;
  // Düzenleme ve iptal AYNI eşiği paylaşır (kullanıcı kararı, 2026-08-20):
  // bitmemiş bir PENDING/CONFIRMED randevu. `PATCH /api/appointments/[id]` de
  // aynı kuralı uygular — buton, reddedileceğini bildiğimiz bir aksiyonu göstermez.
  const duzenlenebilir =
    (randevu.status === "PENDING" || randevu.status === "CONFIRMED") && !bitmisMi;
  const iptalEdilebilir = duzenlenebilir;

  return (
    <li className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">
            {tarihGoster
              ? tarihSaatBicimle(randevu.startsAt, timezone)
              : `${saatBicimle(randevu.startsAt, timezone)} – ${saatBicimle(randevu.endsAt, timezone)}`}
          </p>
          <p className="truncate">
            {randevu.customerName}{" "}
            <a href={`tel:${randevu.customerPhone}`} className="underline">
              {randevu.customerPhone}
            </a>
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {randevu.service.name} · {randevu.service.durationMinutes} dk
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${DURUM_SINIFI[randevu.status]}`}
        >
          {DURUM_METNI[randevu.status]}
        </span>
      </div>

      {onaylanabilir || duzenlenebilir ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onaylanabilir ? (
            <button
              type="button"
              disabled={islemdeMi}
              onClick={onOnayla}
              className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {islemdeMi ? "İşleniyor…" : "Onayla ve WhatsApp'tan bildir"}
            </button>
          ) : null}
          {duzenlenebilir ? (
            <IkincilButon disabled={islemdeMi} onClick={onDuzenle}>
              {duzenleniyorMu ? "Düzenlemeyi kapat" : "Düzenle"}
            </IkincilButon>
          ) : null}
          {iptalEdilebilir ? (
            <IkincilButon tehlike disabled={islemdeMi} onClick={onIptal}>
              İptal et
            </IkincilButon>
          ) : null}
        </div>
      ) : null}

      {children}
    </li>
  );
}
