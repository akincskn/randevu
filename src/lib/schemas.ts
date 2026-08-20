import { z } from "zod";

/**
 * Telefon numarası normalizasyonu.
 *
 * Rate limit anahtarı (spec satır 74) telefon numarasına dayandığı için, aynı
 * numaranın farklı yazımları ("0532 111 22 33", "+90 532 111 22 33") AYNI
 * anahtara düşmelidir; aksi halde limit boşluk koyarak kolayca aşılır.
 *
 * Kural: rakam dışındaki her karakter atılır, Türkiye için 0/90 önekleri
 * temizlenip 10 haneli ulusal biçime indirgenir.
 */
export function telefonNormalizeEt(ham: string): string {
  const rakamlar = ham.replace(/\D/g, "");
  if (rakamlar.length === 12 && rakamlar.startsWith("90")) return rakamlar.slice(2);
  if (rakamlar.length === 11 && rakamlar.startsWith("0")) return rakamlar.slice(1);
  return rakamlar;
}

/**
 * Türkiye cep telefonu: 10 hane, 5 ile başlar (5XXXXXXXXX).
 *
 * `export` edilir çünkü panelin manuel randevu şeması (`schemas-dashboard.ts`)
 * müşteri telefonunu AYNI kurallarla doğrulamak zorunda: aynı numara iki farklı
 * biçimde kaydedilirse müşteri iki ayrı kişi gibi görünür ve WhatsApp linki de
 * farklı numaraya çıkar.
 */
export const telefonSemasi = z
  .string()
  .transform(telefonNormalizeEt)
  .refine((v) => /^5\d{9}$/.test(v), {
    message: "Geçerli bir cep telefonu numarası girin (örn. 0532 111 22 33).",
  });

export const randevuTalebiSemasi = z.object({
  businessSlug: z.string().min(1, "İşletme belirtilmedi."),
  serviceId: z.string().min(1, "Hizmet seçilmedi."),
  customerName: z
    .string()
    .trim()
    .min(2, "Adınızı girin.")
    .max(80, "Ad en fazla 80 karakter olabilir."),
  customerPhone: telefonSemasi,
  /** Randevu başlangıcı — ISO 8601, mutlak an (offset veya Z içermeli). */
  startsAt: z.iso.datetime({ offset: true, message: "Geçersiz tarih/saat biçimi." }),
  turnstileToken: z.string().min(1, "Bot doğrulaması eksik."),
});

export type RandevuTalebi = z.infer<typeof randevuTalebiSemasi>;

/**
 * Müsaitlik sorgusu — `GET /api/availability?businessId=&serviceId=&date=`.
 *
 * `date` bir TAKVİM GÜNÜdür (işletmenin yerel takvimine göre), mutlak an değil:
 * "5 Eylül'de hangi saatler boş?" sorusunun saat dilimi bileşeni yoktur, cevabı
 * vardır. Ufuk (kaç gün ileri) kontrolü burada değil route'ta yapılır — sınır
 * işletmenin BUGÜN'üne göre hesaplanır ve o da `Business.timezone` gerektirir.
 */
export const musaitlikSorgusuSemasi = z.object({
  businessId: z.string().min(1, "İşletme belirtilmedi."),
  serviceId: z.string().min(1, "Hizmet seçilmedi."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.")
    // Regex takvimi bilmez: 2026-02-31 biçimsel olarak geçerlidir ama böyle bir
    // gün yoktur. Date.UTC ile normalize edip geri yazıma karşı doğrulanır.
    .refine((deger) => {
      const [yil, ay, gun] = deger.split("-").map(Number);
      const an = new Date(Date.UTC(yil, ay - 1, gun));
      return (
        an.getUTCFullYear() === yil && an.getUTCMonth() === ay - 1 && an.getUTCDate() === gun
      );
    }, "Böyle bir takvim günü yok."),
  /**
   * Slot hesabından ÇIKARILACAK randevu (berber panelindeki düzenleme akışı).
   *
   * Düzenlenen randevu kendi saatini işgal ediyor; hariç tutulmazsa berber
   * saati AYNI bırakıp yalnızca hizmeti değiştiremezdi — kendi randevusu o
   * saati listeden siler. Veritabanı tarafında güvenlidir: satırın kendisini
   * güncellemek EXCLUDE kısıtını ihlal etmez.
   *
   * Sızıntı riski yok: sorgu zaten `businessId` ile filtreli, yani başka bir
   * dükkanın randevusu verilse bile hiçbir şeyi değiştirmez. Etkisi en fazla
   * "kendi randevunun saatini kendi listende görmek"tir.
   */
  excludeAppointmentId: z.string().min(1).optional(),
});

/** Spec satır 15-16: isim, telefon, opsiyonel adres, sektör + satır 78: email/şifre. */
export const kayitSemasi = z.object({
  name: z.string().trim().min(2, "İşletme adını girin.").max(100),
  phone: telefonSemasi,
  address: z.string().trim().max(200).optional(),
  sector: z.enum(["BERBER", "KUAFOR"], { message: "Sektör BERBER veya KUAFOR olmalı." }),
  email: z.email("Geçerli bir e-posta adresi girin.").toLowerCase(),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı.")
    .max(200, "Şifre en fazla 200 karakter olabilir."),
});

export type Kayit = z.infer<typeof kayitSemasi>;

export const girisSemasi = z.object({
  email: z.email("Geçerli bir e-posta adresi girin.").toLowerCase(),
  password: z.string().min(1, "Şifrenizi girin."),
});

/**
 * İptal talebi — spec satır 71: müşteri, kendisine gelen linkteki `publicToken`
 * ile iptal eder. Berber ise oturumuyla iptal eder, token göndermez.
 */
export const iptalSemasi = z.object({
  publicToken: z.string().min(1).optional(),
});

/**
 * Push aboneliği — tarayıcının `PushSubscription.toJSON()` çıktısıyla aynı şekil.
 *
 * `businessId` BİLEREK alınmıyor: hangi işletmeye abone olunacağı oturumdan
 * belirlenir. İstemciden alınsaydı, herkes başkasının işletmesine abone olup
 * o dükkanın randevu bildirimlerini dinleyebilirdi.
 */
export const pushAbonelikSemasi = z.object({
  endpoint: z.url("Geçersiz push endpoint'i."),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushAbonelik = z.infer<typeof pushAbonelikSemasi>;
