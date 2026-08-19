"use client";

import type { AppointmentAdminDto } from "@/lib/dto-dashboard";
import { saatBicimle, tarihSaatBicimle } from "@/lib/format";

import { IkincilButon } from "./form-ui";

/**
 * Panelde tek bir randevu satırı.
 *
 * Durum SADECE renkle değil METİNLE de bildirilir (renk körlüğü + ekran okuyucu).
 * Aksiyonlar spec satır 25-26 (onayla) ve satır 61 (iptal) ile sınırlıdır;
 * COMPLETED/NO_SHOW işaretlemesi bu fazın kapsamı DIŞINDA (kullanıcı kararı, 2026-08-16).
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
  onOnayla,
  onIptal,
}: {
  randevu: AppointmentAdminDto;
  timezone: string;
  tarihGoster: boolean;
  islemdeMi: boolean;
  onOnayla: () => void;
  onIptal: () => void;
}) {
  const iptalEdilebilir = randevu.status === "PENDING" || randevu.status === "CONFIRMED";

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

      {randevu.status === "PENDING" || iptalEdilebilir ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {randevu.status === "PENDING" ? (
            <button
              type="button"
              disabled={islemdeMi}
              onClick={onOnayla}
              className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {islemdeMi ? "İşleniyor…" : "Onayla ve WhatsApp'tan bildir"}
            </button>
          ) : null}
          {iptalEdilebilir ? (
            <IkincilButon tehlike disabled={islemdeMi} onClick={onIptal}>
              İptal et
            </IkincilButon>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
