import type { WorkingHours, WorkingHoursException } from "@prisma/client";

import { yerelAnHesapla } from "./timezone";

/**
 * Çalışma saati kuralları — spec satır 18-19.
 *
 * Saat dilimi çevrimi burada DEĞİL `timezone.ts`'tedir (CLAUDE.md §2, 200 satır
 * sınırı ve tek sorumluluk): bu modül "hangi saatler açık?" sorusuna bakar,
 * o modül "bu mutlak an yerelde kaça denk geliyor?" sorusuna.
 */

/** Bir günün açık olduğu dakika aralığı; kapalıysa null. */
export interface AcikAralik {
  acilis: number;
  kapanis: number;
}

/**
 * Belirli bir gün için geçerli çalışma aralığını çözer.
 *
 * Öncelik sırası spec satır 19'a dayanır: tekil gün istisnası (bayram, izin)
 * haftalık tekrar eden kaydı EZER.
 */
export function gunlukAralikCoz(
  haftalik: WorkingHours | null,
  istisna: WorkingHoursException | null,
): AcikAralik | null {
  if (istisna) {
    if (istisna.isClosed) return null;
    if (istisna.opensAtMinute === null || istisna.closesAtMinute === null) return null;
    return { acilis: istisna.opensAtMinute, kapanis: istisna.closesAtMinute };
  }

  if (!haftalik || !haftalik.isOpen) return null;
  if (haftalik.opensAtMinute === null || haftalik.closesAtMinute === null) return null;
  return { acilis: haftalik.opensAtMinute, kapanis: haftalik.closesAtMinute };
}

export type UygunlukSonuc =
  | { uygun: true }
  | { uygun: false; sebep: string };

/**
 * Randevunun işletmenin çalışma saatleri içinde olup olmadığını doğrular.
 *
 * Bu kontrol UI'daki slot listesini TEKRAR eder — bilinçli olarak. Spec satır 73
 * "sadece UI kontrolü değil" diyor; istemciden gelen saat asla güvenilir kabul
 * edilmez. (Slot ÇAKIŞMASI ayrı bir katmanda, veritabanı EXCLUDE kısıtıyla korunur.)
 */
export function randevuCalismaSaatiIcindeMi(
  baslangic: Date,
  bitis: Date,
  timezone: string,
  haftalik: WorkingHours | null,
  istisna: WorkingHoursException | null,
): UygunlukSonuc {
  const yerelBaslangic = yerelAnHesapla(baslangic, timezone);
  const yerelBitis = yerelAnHesapla(bitis, timezone);

  if (yerelBaslangic.isoGun !== yerelBitis.isoGun) {
    return { uygun: false, sebep: "Randevu gece yarısını geçemez." };
  }

  const aralik = gunlukAralikCoz(haftalik, istisna);
  if (!aralik) {
    return { uygun: false, sebep: "İşletme bu gün kapalı." };
  }

  if (yerelBaslangic.dakika < aralik.acilis || yerelBitis.dakika > aralik.kapanis) {
    return { uygun: false, sebep: "Seçilen saat işletmenin çalışma saatleri dışında." };
  }

  return { uygun: true };
}
