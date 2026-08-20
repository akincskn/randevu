import type { AppointmentDto } from "./dto";
import type { AppointmentListDto } from "./dto-dashboard";
import { dashboardIstek, dashboardYaz } from "./dashboard-api";

/**
 * Randevu uç noktalarının istemcisi — `dashboard-api.ts`'ten AYRI (200 satır
 * sınırı, CLAUDE.md §2). Taşıma, hata sınıfı ve oturum davranışı ORTAKTIR;
 * burada yalnızca randevuya özgü sözleşmeler tanımlanır.
 */

export type RandevuKapsami = "today" | "upcoming" | "pending" | "all";

export const randevulariGetir = (kapsam: RandevuKapsami): Promise<AppointmentListDto> =>
  dashboardIstek<AppointmentListDto>(`/api/appointments/list?scope=${kapsam}`);

/** Onay yanıtı `whatsappUrl` taşır — berber linke tıklayıp mesajı MANUEL gönderir. */
export interface OnayYaniti {
  appointment: AppointmentDto;
  whatsappUrl: string;
}

export const randevuOnayla = (id: string): Promise<OnayYaniti> =>
  dashboardYaz<OnayYaniti>(`/api/appointments/${encodeURIComponent(id)}/confirm`, "PATCH");

/**
 * Manuel randevu ekleme — spec "Randevu akışı" madde 5 (2026-08-19).
 *
 * Yanıt `OnayYaniti` ile AYNI şekildedir: doğrudan CONFIRMED oluşan randevu ve
 * OPSİYONEL bir `whatsappUrl`. Berber isterse müşteriye onay mesajı gönderir.
 */
export interface ManuelRandevuGirdisi {
  serviceId: string;
  customerName: string;
  customerPhone: string;
  /** Mutlak an, ISO 8601 (offset zorunlu). */
  startsAt: string;
}

export const manuelRandevuOlustur = (girdi: ManuelRandevuGirdisi): Promise<OnayYaniti> =>
  dashboardYaz<OnayYaniti>("/api/appointments/manual", "POST", girdi);

/** Berber iptali: gövde BOŞ gider, yetki oturum cookie'sinden gelir. */
export const randevuIptalEt = (id: string): Promise<AppointmentDto> =>
  dashboardYaz<AppointmentDto>(`/api/appointments/${encodeURIComponent(id)}/cancel`, "PATCH", {});

/**
 * Randevu düzenleme — `PATCH /api/appointments/[id]` (kullanıcı kararı, 2026-08-20).
 *
 * Gönderilmeyen alan DEĞİŞMEZ; sunucu yalnızca gelen alanları yazar. Yanıt
 * `OnayYaniti` ile aynı şekildedir ve `whatsappUrl` OPSİYONELDİR — berber
 * isterse müşteriye "randevunuz güncellendi" mesajını gönderir.
 */
export type RandevuGuncelleGirdisi = Partial<ManuelRandevuGirdisi>;

export const randevuGuncelle = (
  id: string,
  girdi: RandevuGuncelleGirdisi,
): Promise<OnayYaniti> =>
  dashboardYaz<OnayYaniti>(`/api/appointments/${encodeURIComponent(id)}`, "PATCH", girdi);
