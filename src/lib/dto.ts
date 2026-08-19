import type { Appointment, Business, Sector, Service } from "@prisma/client";

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
  /**
   * `timezone` gereklidir: `startsAt` mutlak bir andır ve müşteriye İŞLETMENİN
   * yerel saatiyle gösterilmelidir. Ziyaretçinin cihaz dilimiyle biçimlendirmek,
   * yurt dışındaki (veya seyahatteki) müşteriye yanlış saati gösterirdi.
   */
  business: { name: string; phone: string; address: string | null; timezone: string };
}

type AppointmentIliskili = Appointment & {
  service: Pick<Service, "name" | "durationMinutes" | "price">;
  business: Pick<Business, "name" | "phone" | "address" | "timezone">;
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
      timezone: kayit.business.timezone,
    },
  };
}

/**
 * Müşteri detay ekranının DTO'su (spec satır 30) — `AppointmentDto` + `id`.
 *
 * `id` yalnızca BURADA verilir: iptal butonu `PATCH /api/appointments/[id]/cancel`
 * çağırır ve o endpoint id'yi path'te bekler. Sızma riski yok, çünkü bu yanıtı
 * ancak `publicToken`'ı bilen alır — ve iptal zaten aynı token'ı doğruluyor
 * (spec satır 71). `id`'yi bilmek tek başına hiçbir yetki vermez.
 */
export interface AppointmentDetailDto extends AppointmentDto {
  id: string;
}

export function toAppointmentDetailDto(kayit: AppointmentIliskili): AppointmentDetailDto {
  return { id: kayit.id, ...toAppointmentDto(kayit) };
}

/** DTO üretmek için gereken minimum ilişkisel seçim (Prisma `include`). */
export const APPOINTMENT_DTO_INCLUDE = {
  service: { select: { name: true, durationMinutes: true, price: true } },
  business: { select: { name: true, phone: true, address: true, timezone: true } },
} as const;

/**
 * Public booking sayfasının gördüğü işletme — spec satır 22.
 *
 * `passwordHash` ve `email` KASITLI olarak yoktur. `id` ise verilir: müsaitlik
 * sorgusunun (`GET /api/availability`) parametresidir ve zaten public olan
 * `slug` ile aynı şeyi tanımlar — tek başına hiçbir yetki taşımaz (berber
 * işlemleri imzalı oturum cookie'si ister, bkz. `session.ts`).
 */
export interface ServicePublicDto {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}

export interface BusinessPublicDto {
  id: string;
  slug: string;
  name: string;
  phone: string;
  address: string | null;
  sector: Sector;
  timezone: string;
  services: ServicePublicDto[];
}

type BusinessHizmetli = Pick<
  Business,
  "id" | "slug" | "name" | "phone" | "address" | "sector" | "timezone"
> & {
  services: Pick<Service, "id" | "name" | "durationMinutes" | "price">[];
};

export function toBusinessPublicDto(kayit: BusinessHizmetli): BusinessPublicDto {
  return {
    id: kayit.id,
    slug: kayit.slug,
    name: kayit.name,
    phone: kayit.phone,
    address: kayit.address,
    sector: kayit.sector,
    timezone: kayit.timezone,
    services: kayit.services.map((hizmet) => ({
      id: hizmet.id,
      name: hizmet.name,
      durationMinutes: hizmet.durationMinutes,
      // Decimal -> string: kuruş hassasiyeti float'a çevrilirse bozulur.
      price: hizmet.price === null ? null : hizmet.price.toString(),
    })),
  };
}

/** Public işletme DTO'su için gereken minimum seçim (Prisma `select`). */
export const BUSINESS_PUBLIC_DTO_SELECT = {
  id: true,
  slug: true,
  name: true,
  phone: true,
  address: true,
  sector: true,
  timezone: true,
  services: {
    // Pasif hizmetler public sayfada GÖRÜNMEZ (PROJECT_SPEC.md "Onaylanan
    // Çıkarımlar", 2026-08-16). Filtre burada, DTO seçiminde durur ki public
    // yanıtı üreten her yol aynı kuralı otomatik uygulasın.
    where: { isActive: true },
    select: { id: true, name: true, durationMinutes: true, price: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

/**
 * Bir günün müsait saatleri — spec satır 22 ("uygun saati görür").
 *
 * `slots` mutlak an listesidir (ISO 8601, UTC). İstemci bunu `timezone` ile
 * biçimlendirir; yerel duvar saati stringi GÖNDERİLMEZ, çünkü POST gövdesi de
 * mutlak an bekler (`randevuTalebiSemasi.startsAt`) ve ikisinin ayrışması
 * yanlış saate randevu yazılmasına yol açardı.
 */
export interface AvailabilityDto {
  date: string;
  timezone: string;
  serviceId: string;
  slots: string[];
}
