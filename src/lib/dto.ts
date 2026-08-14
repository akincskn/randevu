import type { Appointment, Business, Service } from "@prisma/client";

/**
 * CLAUDE.md §2: "DTO pattern between database models and API responses — never
 * leak raw Prisma models to the client."
 *
 * Özellikle sızmaması gerekenler: `Business.passwordHash`, iç `id` alanları ve
 * `publicToken` (yalnızca onu zaten bilen tarafa, oluşturma yanıtında verilir).
 */

export interface AppointmentDto {
  publicToken: string;
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
  service: { name: string; durationMinutes: number; price: string | null };
  business: { name: string; phone: string; address: string | null };
}

type AppointmentIliskili = Appointment & {
  service: Pick<Service, "name" | "durationMinutes" | "price">;
  business: Pick<Business, "name" | "phone" | "address">;
};

export function toAppointmentDto(kayit: AppointmentIliskili): AppointmentDto {
  return {
    publicToken: kayit.publicToken,
    customerName: kayit.customerName,
    customerPhone: kayit.customerPhone,
    startsAt: kayit.startsAt.toISOString(),
    endsAt: kayit.endsAt.toISOString(),
    status: kayit.status,
    service: {
      name: kayit.service.name,
      durationMinutes: kayit.service.durationMinutes,
      // Decimal -> string: JSON'da float'a çevrilirse kuruş hassasiyeti bozulur.
      price: kayit.service.price === null ? null : kayit.service.price.toString(),
    },
    business: {
      name: kayit.business.name,
      phone: kayit.business.phone,
      address: kayit.business.address,
    },
  };
}

/** DTO üretmek için gereken minimum ilişkisel seçim (Prisma `include`). */
export const APPOINTMENT_DTO_INCLUDE = {
  service: { select: { name: true, durationMinutes: true, price: true } },
  business: { select: { name: true, phone: true, address: true } },
} as const;
