import { z } from "zod";

import { telefonSemasi } from "./schemas";

/**
 * Berber paneli Zod şemaları — `schemas.ts`'ten AYRI (200 satır sınırı, CLAUDE.md §2).
 *
 * Saat değerleri gece yarısından itibaren DAKİKA'dır (0-1439) ve YEREL duvar
 * saatidir; `Business.timezone` ile yorumlanır (bkz. `prisma/schema.prisma`).
 */

const GUN_DAKIKA = 24 * 60;

const dakikaSemasi = z
  .number()
  .int("Dakika tam sayı olmalı.")
  .min(0, "Saat 00:00'dan önce olamaz.")
  .max(GUN_DAKIKA, "Saat 24:00'ü geçemez.");

/** Spec satır 17: isim, süre (dakika), opsiyonel fiyat. */
export const hizmetOlusturSemasi = z.object({
  name: z.string().trim().min(2, "Hizmet adı en az 2 karakter olmalı.").max(80),
  durationMinutes: z
    .number()
    .int("Süre tam sayı olmalı.")
    // Üst sınır bir gün: daha uzunu tek günlük slot üretecinde asla yer bulamaz
    // (`slotlariUret` kapanışı taşan slotu eler) ve büyük olasılıkla yazım hatasıdır.
    .min(1, "Süre en az 1 dakika olmalı.")
    .max(GUN_DAKIKA, "Süre 24 saati geçemez."),
  /**
   * Fiyat string olarak alınır: `number` kullanılsaydı JSON float'ı kuruş
   * hassasiyetini bozardı (Prisma tarafı `Decimal(10,2)`).
   */
  price: z
    .string()
    .trim()
    .regex(/^\d{1,8}([.,]\d{1,2})?$/, "Fiyat örn. 250 veya 250,50 biçiminde olmalı.")
    .transform((deger) => deger.replace(",", "."))
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

/** Güncellemede her alan opsiyonel; en az biri gönderilmelidir. */
export const hizmetGuncelleSemasi = hizmetOlusturSemasi.partial().refine(
  (deger) => Object.keys(deger).length > 0,
  "Güncellenecek en az bir alan gönderin.",
);

/**
 * Bir günün çalışma saati. `isOpen` true ise açılış/kapanış ZORUNLU ve
 * kapanış açılıştan sonra olmalıdır — aksi halde o gün hiç slot üretmez ve
 * sebebi kullanıcıya görünmez olurdu.
 */
const gunSemasi = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    opensAtMinute: dakikaSemasi.nullable(),
    closesAtMinute: dakikaSemasi.nullable(),
  })
  .refine(
    (g) => !g.isOpen || (g.opensAtMinute !== null && g.closesAtMinute !== null),
    "Açık gün için açılış ve kapanış saati zorunlu.",
  )
  .refine(
    (g) =>
      !g.isOpen ||
      g.opensAtMinute === null ||
      g.closesAtMinute === null ||
      g.closesAtMinute > g.opensAtMinute,
    "Kapanış saati açılıştan sonra olmalı.",
  );

/**
 * Haftanın TAMAMI tek seferde gönderilir (7 gün, her biri bir kez).
 *
 * Kısmi güncelleme kabul edilmez: `WorkingHours` üzerinde
 * `@@unique([businessId, dayOfWeek])` var ve haftayı bütün olarak yazmak,
 * "eksik gün" diye bir ara duruma hiç düşmemeyi garanti eder.
 */
export const haftalikSaatSemasi = z
  .array(gunSemasi)
  .length(7, "Haftanın yedi günü de gönderilmeli.")
  .refine(
    (gunler) => new Set(gunler.map((g) => g.dayOfWeek)).size === 7,
    "Her gün tam olarak bir kez gönderilmeli.",
  );

/** Spec satır 19: tekil gün bazlı kapatma/özel saat. */
export const istisnaSemasi = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.")
      .refine((deger) => {
        const [yil, ay, gun] = deger.split("-").map(Number);
        const an = new Date(Date.UTC(yil, ay - 1, gun));
        return (
          an.getUTCFullYear() === yil && an.getUTCMonth() === ay - 1 && an.getUTCDate() === gun
        );
      }, "Böyle bir takvim günü yok."),
    isClosed: z.boolean(),
    opensAtMinute: dakikaSemasi.nullable().optional(),
    closesAtMinute: dakikaSemasi.nullable().optional(),
  })
  .refine(
    (i) => i.isClosed || (i.opensAtMinute !== null && i.opensAtMinute !== undefined),
    "Özel saatli istisna için açılış saati zorunlu.",
  )
  .refine(
    (i) => i.isClosed || (i.closesAtMinute !== null && i.closesAtMinute !== undefined),
    "Özel saatli istisna için kapanış saati zorunlu.",
  )
  .refine(
    (i) =>
      i.isClosed ||
      i.opensAtMinute === null ||
      i.opensAtMinute === undefined ||
      i.closesAtMinute === null ||
      i.closesAtMinute === undefined ||
      i.closesAtMinute > i.opensAtMinute,
    "Kapanış saati açılıştan sonra olmalı.",
  );

/** Panel randevu listesi filtresi. */
export const randevuFiltreSemasi = z.object({
  scope: z.enum(["today", "upcoming", "pending", "all"]).default("today"),
});

/**
 * Manuel randevu — `POST /api/appointments/manual` (spec "Randevu akışı" madde 5,
 * 2026-08-19 kapsam eklentisi).
 *
 * Public `randevuTalebiSemasi`'ndan farkları BİLİNÇLİDİR:
 *   - `businessSlug` YOK: işletme oturumdan gelir, istemciden alınırsa berber
 *     başkasının dükkanına randevu yazabilirdi.
 *   - `turnstileToken` YOK: giriş yapmış berber zaten doğrulanmış bir insandır.
 *
 * `startsAt` yine MUTLAK andır (ISO 8601, offset zorunlu) — public akışla aynı
 * sözleşme; yerel duvar saatine çeviri istemcide `mutlakAnHesapla` ile yapılır.
 */
export const manuelRandevuSemasi = z.object({
  serviceId: z.string().min(1, "Hizmet seçilmedi."),
  customerName: z
    .string()
    .trim()
    .min(2, "Müşteri adını girin.")
    .max(80, "Ad en fazla 80 karakter olabilir."),
  customerPhone: telefonSemasi,
  startsAt: z.iso.datetime({ offset: true, message: "Geçersiz tarih/saat biçimi." }),
});

/**
 * Randevu düzenleme — `PATCH /api/appointments/[id]` (kullanıcı kararı, 2026-08-20).
 *
 * TÜM alanlar opsiyoneldir ve en az biri gönderilmelidir; `hizmetGuncelleSemasi`
 * ile aynı desen. Gönderilmeyen alan DEĞİŞMEZ — istemcinin tüm kaydı geri
 * yollamasını beklemek, iki sekmede açık panelde birinin diğerinin değişikliğini
 * sessizce geri almasına yol açardı.
 *
 * `status` BURADA YOK ve bilinçlidir: durum geçişlerinin kendi uç noktaları var
 * (`/confirm`, `/cancel`) ve COMPLETED/EXPIRED'ı cron yazar. Durumu serbest bir
 * güncelleme alanı yapmak, o üç mekanizmanın kurallarını baypas ederdi.
 */
export const randevuGuncelleSemasi = manuelRandevuSemasi.partial().refine(
  (deger) => Object.keys(deger).length > 0,
  "Güncellenecek en az bir alan gönderin.",
);
