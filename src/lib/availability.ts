import type { WorkingHours, WorkingHoursException } from "@prisma/client";

/**
 * Mutlak zaman (TIMESTAMPTZ) ile işletmenin yerel duvar saati arasındaki köprü.
 *
 * Veritabanında `Appointment.startsAt` mutlak bir andır; `WorkingHours` ise gece
 * yarısından itibaren dakika cinsinden YEREL duvar saatidir. İkisini birbirine
 * çevirmek için `Business.timezone` (IANA adı) gerekir — bu yüzden o alan zorunlu.
 */
export interface YerelAn {
  /** ISO takvim günü, işletmenin yerel saatine göre (YYYY-MM-DD). */
  isoGun: string;
  /** Haftanın günü — 0=Pazar ... 6=Cumartesi, Prisma şemasındaki dayOfWeek ile aynı. */
  haftaninGunu: number;
  /** Gece yarısından itibaren dakika (0-1439). */
  dakika: number;
}

const HAFTA_GUNU_INDEKS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Mutlak bir anı, verilen IANA saat diliminde yerel gün + dakikaya çevirir.
 *
 * `Intl.DateTimeFormat` kullanılır: yaz saati geçişlerini ve tarihî offset
 * değişikliklerini IANA veritabanından okur. Elle offset hesabı yapılmaz —
 * Türkiye 2016'da kalıcı UTC+3'e geçti, sabit offset varsaymak eski tarihli
 * kayıtlarda yanlış sonuç verir.
 */
export function yerelAnHesapla(an: Date, timezone: string): YerelAn {
  const parcalar = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(an);

  const al = (tip: Intl.DateTimeFormatPartTypes): string =>
    parcalar.find((p) => p.type === tip)?.value ?? "";

  // hour12:false bazı ortamlarda gece yarısını "24" olarak verir; 0'a normalize et.
  const saat = Number(al("hour")) % 24;
  const dakika = Number(al("minute"));
  const haftaninGunu = HAFTA_GUNU_INDEKS[al("weekday")];

  if (haftaninGunu === undefined || Number.isNaN(saat) || Number.isNaN(dakika)) {
    throw new Error(`Saat dilimi çözümlenemedi: ${timezone}`);
  }

  return {
    isoGun: `${al("year")}-${al("month")}-${al("day")}`,
    haftaninGunu,
    dakika: saat * 60 + dakika,
  };
}

/** Bir günün açık olduğu dakika aralığı; kapalıysa null. */
interface AcikAralik {
  acilis: number;
  kapanis: number;
}

/**
 * Belirli bir gün için geçerli çalışma aralığını çözer.
 *
 * Öncelik sırası spec satır 19'a dayanır: tekil gün istisnası (bayram, izin)
 * haftalık tekrar eden kaydı EZER.
 */
function gunlukAralikCoz(
  yerel: YerelAn,
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
 * Bu kontrol UI'daki slot listesini TEKRAR eder — bilinçli olarak. Spec satır 44
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

  const aralik = gunlukAralikCoz(yerelBaslangic, haftalik, istisna);
  if (!aralik) {
    return { uygun: false, sebep: "İşletme bu gün kapalı." };
  }

  if (yerelBaslangic.dakika < aralik.acilis || yerelBitis.dakika > aralik.kapanis) {
    return { uygun: false, sebep: "Seçilen saat işletmenin çalışma saatleri dışında." };
  }

  return { uygun: true };
}
