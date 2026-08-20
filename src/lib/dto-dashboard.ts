import type {
  Appointment,
  Service,
  WorkingHours,
  WorkingHoursException,
} from "@prisma/client";

/**
 * Berber paneli DTO'ları — `dto.ts`'ten AYRI (200 satır sınırı, CLAUDE.md §2).
 *
 * Public DTO'lardan farkları bilinçlidir:
 *   - `id` VERİLİR: panel aksiyonları (onayla/iptal/sil) id ile çalışır ve
 *     istekler zaten oturum cookie'siyle korunuyor.
 *   - `isActive` VERİLİR: pasif hizmetler public listede yok, panelde VAR —
 *     berber onları tekrar aktifleştirebilmeli.
 */

export interface AppointmentAdminDto {
  id: string;
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
  /**
   * `id` VERİLİR: düzenleme formu hizmet seçicisini mevcut hizmetle açmak
   * zorunda (kullanıcı kararı, 2026-08-20). İsim eşleştirmesi kırılgan olurdu —
   * aynı ada sahip iki hizmet tanımlanabilir.
   */
  service: { id: string; name: string; durationMinutes: number };
}

type AppointmentAdminKayit = Pick<
  Appointment,
  "id" | "customerName" | "customerPhone" | "startsAt" | "endsAt" | "status"
> & { service: Pick<Service, "id" | "name" | "durationMinutes"> };

export function toAppointmentAdminDto(kayit: AppointmentAdminKayit): AppointmentAdminDto {
  return {
    id: kayit.id,
    customerName: kayit.customerName,
    customerPhone: kayit.customerPhone,
    startsAt: kayit.startsAt.toISOString(),
    endsAt: kayit.endsAt.toISOString(),
    status: kayit.status,
    service: {
      id: kayit.service.id,
      name: kayit.service.name,
      durationMinutes: kayit.service.durationMinutes,
    },
  };
}

export const APPOINTMENT_ADMIN_SELECT = {
  id: true,
  customerName: true,
  customerPhone: true,
  startsAt: true,
  endsAt: true,
  status: true,
  service: { select: { id: true, name: true, durationMinutes: true } },
} as const;

/**
 * Panelin randevu yanıtı.
 *
 * `pendingCount` HER yanıtta döner — spec satır 68 rozetin "her zaman görünür"
 * olmasını istiyor. Ayrı bir sayaç endpoint'i açmak yerine listeyle birlikte
 * göndermek, rozetin listeyle ASLA ayrışmamasını garanti eder.
 */
export interface AppointmentListDto {
  pendingCount: number;
  appointments: AppointmentAdminDto[];
  timezone: string;
}

export interface ServiceAdminDto {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
  isActive: boolean;
  /** Bu hizmete bağlı randevu sayısı — 0 değilse silinemez (onDelete: Restrict). */
  appointmentCount: number;
}

type ServiceAdminKayit = Pick<
  Service,
  "id" | "name" | "durationMinutes" | "price" | "isActive"
> & { _count: { appointments: number } };

export function toServiceAdminDto(kayit: ServiceAdminKayit): ServiceAdminDto {
  return {
    id: kayit.id,
    name: kayit.name,
    durationMinutes: kayit.durationMinutes,
    // Decimal -> string: JSON'da float'a çevrilirse kuruş hassasiyeti bozulur.
    price: kayit.price === null ? null : kayit.price.toString(),
    isActive: kayit.isActive,
    appointmentCount: kayit._count.appointments,
  };
}

export const SERVICE_ADMIN_SELECT = {
  id: true,
  name: true,
  durationMinutes: true,
  price: true,
  isActive: true,
  _count: { select: { appointments: true } },
} as const;

/** Haftalık çalışma saati — spec satır 18. Dakika değerleri YEREL duvar saatidir. */
export interface WorkingHoursDto {
  dayOfWeek: number;
  isOpen: boolean;
  opensAtMinute: number | null;
  closesAtMinute: number | null;
}

export function toWorkingHoursDto(kayit: WorkingHours): WorkingHoursDto {
  return {
    dayOfWeek: kayit.dayOfWeek,
    isOpen: kayit.isOpen,
    opensAtMinute: kayit.opensAtMinute,
    closesAtMinute: kayit.closesAtMinute,
  };
}

/** Çalışma saati istisnası — spec satır 19. `date` takvim günüdür, mutlak an değil. */
export interface ExceptionDto {
  id: string;
  date: string;
  isClosed: boolean;
  opensAtMinute: number | null;
  closesAtMinute: number | null;
}

export function toExceptionDto(kayit: WorkingHoursException): ExceptionDto {
  return {
    id: kayit.id,
    // `@db.Date` UTC gece yarısı olarak okunur; ISO gününe kesmek doğru olanıdır.
    date: kayit.date.toISOString().slice(0, 10),
    isClosed: kayit.isClosed,
    opensAtMinute: kayit.opensAtMinute,
    closesAtMinute: kayit.closesAtMinute,
  };
}
