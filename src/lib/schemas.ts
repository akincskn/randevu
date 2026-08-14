import { z } from "zod";

/**
 * Telefon numarası normalizasyonu.
 *
 * Rate limit anahtarı (spec satır 45) telefon numarasına dayandığı için, aynı
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

/** Türkiye cep telefonu: 10 hane, 5 ile başlar (5XXXXXXXXX). */
const telefonSemasi = z
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

/** Spec satır 15-16: isim, telefon, opsiyonel adres, sektör + satır 49: email/şifre. */
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
 * İptal talebi — spec satır 42: müşteri, kendisine gelen linkteki `publicToken`
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
