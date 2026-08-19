import type { WorkingHours, WorkingHoursException } from "@prisma/client";

import { gunlukAralikCoz } from "./availability";
import { isoGunEkle, isoGunHaftaninGunu } from "./slots";
import { mutlakAnHesapla, yerelAnHesapla } from "./timezone";

/**
 * ÇALIŞMA SAATİ FARKINDALIKLI ZAMAN AŞIMI — spec satır 61-64.
 *
 * Spec sabit bir duvar saati kuralını (ör. "2 saat sonra iptal") AÇIKÇA reddediyor:
 * gece verilen randevuyu haksız cezalandırırdı. Bunun yerine bir PENDING randevu,
 * işletmenin AÇIK olduğu toplam `ZAMAN_ASIMI_DAKIKA` dakika geçtikten sonra düşer;
 * kapalı saatlerde sayaç DURUR ve ertesi açılışta kaldığı yerden devam eder
 * (kullanıcı kararı, 2026-08-16 — bkz. PROJECT_SPEC.md "Onaylanan Çıkarımlar").
 *
 * Bu modül SAF'tır: veritabanına erişmez, `slots.ts` ile aynı gerekçeyle
 * (test edilebilirlik, sorgu sorumluluğunun servis/route katmanında kalması).
 */

/** Onay için tanınan AÇIK dakika bütçesi (kullanıcı kararı, 2026-08-16). */
export const ZAMAN_ASIMI_DAKIKA = 120;

/**
 * Birikim döngüsünün gezebileceği en fazla yerel gün sayısı.
 *
 * Sonsuz döngü koruması. Sınıra ULAŞILIRSA bütçe dolmamış sayılır (fail-safe):
 * her günü kapalı bir işletmede sayaç gerçekten hiç ilerlemez ve o randevuyu
 * "süresi doldu" saymak spec satır 64'i ihlal ederdi. Böyle kayıtlar pratikte
 * `startsAt` koşuluyla düşer (bkz. `randevuSuresiDolduMu`).
 */
const MAX_GUN = 400;

/** Bir işletmenin çalışma takvimi — hesabın ihtiyaç duyduğu her şey. */
export interface CalismaTakvimi {
  /** IANA saat dilimi adı (`Business.timezone`). */
  timezone: string;
  /** `WorkingHours.dayOfWeek` (0=Pazar ... 6=Cumartesi) -> haftalık kayıt. */
  haftalik: Map<number, WorkingHours>;
  /** ISO takvim günü (YYYY-MM-DD) -> o güne özel istisna. */
  istisnalar: Map<string, WorkingHoursException>;
}

/** Bir günün açık olduğu MUTLAK zaman penceresi. */
export interface AcikPencere {
  acilis: Date;
  kapanis: Date;
}

/**
 * Yerel gün + dakikayı mutlak ana çevirir; gece yarısını (1440) ertesi güne taşır.
 *
 * `mutlakAnHesapla` yalnızca 0-1439 aralığını kabul eder — geri çevrim kontrolü
 * 1440'ı ertesi günün 0'ı olarak görüp `null` döndürür. Panel şeması bugün 1439
 * ile sınırlı olsa da kapanışın gece yarısına eşit olamayacağı varsayımına
 * güvenilmez (CLAUDE.md §2, savunmacı programlama).
 */
function gunIcindeMutlakAn(isoGun: string, dakika: number, timezone: string): Date | null {
  if (dakika >= 1440) {
    return mutlakAnHesapla(isoGunEkle(isoGun, Math.floor(dakika / 1440)), dakika % 1440, timezone);
  }
  return mutlakAnHesapla(isoGun, dakika, timezone);
}

/**
 * Verilen yerel günün açık penceresini MUTLAK zaman olarak çözer; kapalıysa null.
 *
 * İstisna haftalık kaydı ezer — bu öncelik `gunlukAralikCoz`'da tek yerde tanımlı
 * ve slot üreteciyle paylaşılır, iki farklı "açık mı?" yorumu doğmasın diye.
 *
 * Yaz saati geçişindeki VAR OLMAYAN duvar saatleri (`mutlakAnHesapla` -> null)
 * o günü kapalı sayar: sayaç ilerlemez, yani randevu daha GEÇ düşer. Fail-safe
 * yön kasıtlıdır — hatalı erken iptal, hatalı gecikmeden daha maliyetlidir.
 */
export function gunlukAcikPencere(takvim: CalismaTakvimi, isoGun: string): AcikPencere | null {
  const aralik = gunlukAralikCoz(
    takvim.haftalik.get(isoGunHaftaninGunu(isoGun)) ?? null,
    takvim.istisnalar.get(isoGun) ?? null,
  );
  if (!aralik) return null;

  const acilis = gunIcindeMutlakAn(isoGun, aralik.acilis, takvim.timezone);
  const kapanis = gunIcindeMutlakAn(isoGun, aralik.kapanis, takvim.timezone);
  if (!acilis || !kapanis || kapanis.getTime() <= acilis.getTime()) return null;

  return { acilis, kapanis };
}

/**
 * `[baslangic, bitis)` aralığında işletmenin AÇIK olduğu toplam süreyi (ms) verir.
 *
 * Gün gün yürünür ve her günün açık penceresi MUTLAK zamana çevrilerek kesişim
 * alınır. Duvar saati farkı (kapanış dakikası - açılış dakikası) yerine mutlak
 * fark kullanılmasının sebebi yaz saati geçişleridir: 09:00-18:00 açık bir günde
 * saatler ileri alınmışsa gerçekte 9 değil 8 saat geçmiştir.
 *
 * `hedefMs` verilirse birikim o eşiği aşar aşmaz döngü kesilir — 120 dakikalık
 * bütçe tipik olarak ilk açık günde dolar, aylık kayıtlar için tur atılmaz.
 */
export function acikGecenSureMs(
  takvim: CalismaTakvimi,
  baslangic: Date,
  bitis: Date,
  hedefMs = Number.POSITIVE_INFINITY,
): number {
  if (bitis.getTime() <= baslangic.getTime()) return 0;

  const sonGun = yerelAnHesapla(bitis, takvim.timezone).isoGun;
  let isoGun = yerelAnHesapla(baslangic, takvim.timezone).isoGun;
  let birikim = 0;

  for (let tur = 0; tur < MAX_GUN; tur += 1) {
    const pencere = gunlukAcikPencere(takvim, isoGun);
    if (pencere) {
      const pencereBas = Math.max(pencere.acilis.getTime(), baslangic.getTime());
      const pencereBit = Math.min(pencere.kapanis.getTime(), bitis.getTime());
      if (pencereBit > pencereBas) birikim += pencereBit - pencereBas;
    }

    if (birikim >= hedefMs) return birikim;
    if (isoGun === sonGun) return birikim;
    isoGun = isoGunEkle(isoGun, 1);
  }

  console.warn(
    `[expiry] ${MAX_GUN} günlük tarama sınırına ulaşıldı (${takvim.timezone}); ` +
      "birikim eksik hesaplandı, randevu SÜRESİ DOLMAMIŞ sayılıyor.",
  );
  return birikim;
}

/** Zaman aşımı kararı için gereken randevu alanları. */
export interface ZamanAsimiAdayi {
  createdAt: Date;
  startsAt: Date;
}

/**
 * Bir PENDING randevunun süresinin dolup dolmadığını söyler.
 *
 * İKİ koşuldan hangisi ÖNCE gerçekleşirse o uygulanır (kullanıcı kararı, 2026-08-16):
 *   1. Randevu SAATİ geçti — geçmiş bir saati onaylamak anlamsızdır ve o slot
 *      `Appointment_no_overlap_excl` gereği boşuna dolu tutulur.
 *   2. İşletmenin açık olduğu `ZAMAN_ASIMI_DAKIKA` dakika birikti (spec satır 63-64).
 */
export function randevuSuresiDolduMu(
  takvim: CalismaTakvimi,
  randevu: ZamanAsimiAdayi,
  simdi: Date,
  butceDakika: number = ZAMAN_ASIMI_DAKIKA,
): boolean {
  if (randevu.startsAt.getTime() <= simdi.getTime()) return true;

  const hedefMs = butceDakika * 60_000;
  return acikGecenSureMs(takvim, randevu.createdAt, simdi, hedefMs) >= hedefMs;
}
