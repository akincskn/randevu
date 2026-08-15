import type { WorkingHours, WorkingHoursException } from "@prisma/client";

import { gunlukAralikCoz } from "./availability";
import { mutlakAnHesapla } from "./timezone";

/**
 * MÜSAİT SLOT ÜRETECİ — spec satır 22 ("uygun saati görür").
 *
 * `availability.ts` "bu saat uygun mu?" sorusunu cevaplar; burası "bu gün hangi
 * saatler uygun?" sorusunu cevaplar. İkisi bilinçli olarak ayrı: birincisi POST
 * anında sunucu tarafı savunma, ikincisi müşteriye gösterilen liste. Liste
 * üreteci kaybolsa bile POST'taki kontrol randevuyu korumaya devam eder.
 *
 * Bu modül SAF'tır (veritabanına erişmez): girdisi hazır okunmuş kayıtlardır.
 * Böylece test edilebilir kalır ve sorgu sorumluluğu route katmanında durur.
 */

/** Slot'u TUTAN mevcut bir randevunun kapladığı mutlak aralık. */
export interface DoluAralik {
  baslangic: Date;
  bitis: Date;
}

export interface SlotUretimGirdisi {
  /** İşletmenin yerel takvimine göre gün (YYYY-MM-DD). */
  isoGun: string;
  /** IANA saat dilimi adı (`Business.timezone`). */
  timezone: string;
  /** `Service.durationMinutes` — slot uzunluğu VE slot adımı. */
  hizmetSuresiDakika: number;
  haftalik: WorkingHours | null;
  istisna: WorkingHoursException | null;
  /**
   * O güne değen ve slot'u TUTAN randevular. Çağıran, `CANCELLED` ve `EXPIRED`
   * kayıtları ELEMİŞ olmalıdır — bu ayrım `Appointment_no_overlap_excl` kısıtının
   * WHERE predicate'iyle birebir aynı olmak ZORUNDA, aksi halde listede görünen
   * bir saat yazma anında 409 SLOT_TAKEN ile reddedilir.
   */
  doluAraliklar: DoluAralik[];
  /** Referans "şimdi" anı — geçmiş saatlerin elenmesi buna göre yapılır. */
  simdi: Date;
}

/**
 * Rezervasyon ufku: işletmenin BUGÜN'ü dahil kaç gün ileriye randevu alınabilir.
 * Spec'te yazmıyor; 14 gün kullanıcı kararıdır (2026-08-15).
 */
export const REZERVASYON_UFKU_GUN = 14;

/** ISO takvim gününe gün ekler. Takvim günü saat dilimi taşımaz, UTC'de çözümlenir. */
export function isoGunEkle(isoGun: string, gunSayisi: number): string {
  const damga = Date.parse(`${isoGun}T00:00:00Z`);
  if (Number.isNaN(damga)) {
    throw new Error(`Geçersiz ISO gün: ${isoGun}`);
  }
  return new Date(damga + gunSayisi * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Bir ISO takvim gününün haftanın kaçıncı günü olduğunu verir (0=Pazar ... 6=Cumartesi,
 * `WorkingHours.dayOfWeek` ile aynı). Takvim günü saat dilimi taşımadığı için UTC'de
 * çözümlenir — sonuç saat diliminden bağımsızdır.
 */
export function isoGunHaftaninGunu(isoGun: string): number {
  const damga = Date.parse(`${isoGun}T00:00:00Z`);
  if (Number.isNaN(damga)) {
    throw new Error(`Geçersiz ISO gün: ${isoGun}`);
  }
  return new Date(damga).getUTCDay();
}

/**
 * İki yarı-açık aralık `[baslangic, bitis)` çakışıyor mu?
 *
 * Yarı-açık sınır kasıtlı: 10:00-10:45 ile 10:45-11:30 BİTİŞİKTİR, çakışmaz.
 * Bu, veritabanındaki `tstzrange(...,'[)')` semantiğinin aynısıdır.
 */
function cakisiyorMu(aBas: Date, aBit: Date, bBas: Date, bBit: Date): boolean {
  return aBas.getTime() < bBit.getTime() && aBit.getTime() > bBas.getTime();
}

/**
 * Verilen gün için müsait randevu başlangıçlarını üretir.
 *
 * Adım = hizmet süresi (kullanıcı kararı, 2026-08-15): slot'lar açılıştan itibaren
 * arka arkaya dizilir, aralarında ölü boşluk kalmaz. Son slot'un BİTİŞİ kapanışı
 * geçemez.
 *
 * Elenenler:
 *   1. Kapalı gün (istisna haftalık kaydı ezer) -> boş liste
 *   2. Kapanışa sığmayan son slot
 *   3. Yaz saati geçişinde var olmayan duvar saatleri (`mutlakAnHesapla` -> null)
 *   4. Geçmiş saatler — sınır POST'taki `<= Date.now()` reddiyle aynı tutulur
 *   5. Slot'u tutan mevcut bir randevuyla çakışanlar
 */
export function slotlariUret(girdi: SlotUretimGirdisi): Date[] {
  const { hizmetSuresiDakika } = girdi;

  // Savunmacı: sıfır/negatif süre sonsuz döngü üretirdi. Veritabanında
  // `Service_durationMinutes_positive_check` bunu zaten engelliyor; buradaki
  // kontrol o kısıtın atlanabildiği hiçbir yol olmadığına güvenmemek içindir.
  if (!Number.isInteger(hizmetSuresiDakika) || hizmetSuresiDakika <= 0) {
    return [];
  }

  const aralik = gunlukAralikCoz(girdi.haftalik, girdi.istisna);
  if (!aralik || aralik.kapanis <= aralik.acilis) {
    return [];
  }

  const slotlar: Date[] = [];

  for (
    let dakika = aralik.acilis;
    dakika + hizmetSuresiDakika <= aralik.kapanis;
    dakika += hizmetSuresiDakika
  ) {
    const baslangic = mutlakAnHesapla(girdi.isoGun, dakika, girdi.timezone);
    if (!baslangic) continue;

    if (baslangic.getTime() <= girdi.simdi.getTime()) continue;

    const bitis = new Date(baslangic.getTime() + hizmetSuresiDakika * 60_000);

    const dolu = girdi.doluAraliklar.some((mevcut) =>
      cakisiyorMu(baslangic, bitis, mevcut.baslangic, mevcut.bitis),
    );
    if (dolu) continue;

    slotlar.push(baslangic);
  }

  return slotlar;
}
