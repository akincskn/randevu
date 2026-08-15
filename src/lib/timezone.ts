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

/**
 * Verilen anda, verilen saat diliminin UTC'ye göre offset'i (ms).
 *
 * `Intl` ile o andaki YEREL duvar saati okunur ve aynı bileşenlerden bir UTC
 * damgası kurulur; ikisinin farkı offset'tir. Sabit offset varsayımı yapılmaz.
 */
function offsetHesapla(an: Date, timezone: string): number {
  const parcalar = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(an);

  const al = (tip: Intl.DateTimeFormatPartTypes): number =>
    Number(parcalar.find((p) => p.type === tip)?.value);

  const yerelDamga = Date.UTC(
    al("year"),
    al("month") - 1,
    al("day"),
    al("hour") % 24,
    al("minute"),
    al("second"),
  );

  if (Number.isNaN(yerelDamga)) {
    throw new Error(`Saat dilimi çözümlenemedi: ${timezone}`);
  }

  // `an`'ın milisaniye kısmı formatlanmadığı için saniyeye yuvarlanarak karşılaştırılır.
  return yerelDamga - Math.floor(an.getTime() / 1000) * 1000;
}

/**
 * `yerelAnHesapla`'nın TERSİ: yerel takvim günü + dakikadan mutlak anı üretir.
 *
 * Slot üreteci çalışma saatlerini yerel dakika olarak okur ama `Appointment.startsAt`
 * mutlak bir andır (TIMESTAMPTZ) — bu köprü olmadan slot'lar veritabanına yazılamaz.
 *
 * İki turlu çözüm: ilk tahmin naif UTC damgasından yapılır, o andaki offset ile
 * düzeltilir, sonra düzeltilmiş anın offset'iyle bir kez daha hesaplanır. İkinci tur
 * yaz saati geçişinin HEMEN yanındaki saatler için gereklidir (ilk tahmin geçişin
 * yanlış tarafına düşebilir).
 *
 * Geçiş sırasında VAR OLMAYAN yerel saatler (ileri alınan saatteki boşluk) için
 * `null` döner: sonuç geri çevrildiğinde istenen gün/dakikayı vermiyorsa o duvar
 * saati o gün hiç yaşanmamıştır ve o saate randevu üretilemez.
 */
export function mutlakAnHesapla(isoGun: string, dakika: number, timezone: string): Date | null {
  const naifDamga = Date.parse(`${isoGun}T00:00:00Z`);
  if (Number.isNaN(naifDamga)) {
    throw new Error(`Geçersiz ISO gün: ${isoGun}`);
  }

  const hedef = naifDamga + dakika * 60_000;
  const ilkTahmin = hedef - offsetHesapla(new Date(hedef), timezone);
  const an = new Date(hedef - offsetHesapla(new Date(ilkTahmin), timezone));

  const geriCevrim = yerelAnHesapla(an, timezone);
  if (geriCevrim.isoGun !== isoGun || geriCevrim.dakika !== dakika) {
    return null;
  }

  return an;
}
