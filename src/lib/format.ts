/**
 * Müşteriye gösterilen tarih/saat biçimlendirmesi.
 *
 * Hedef kitle Türkiye esnafı ve müşterisidir (spec satır 9), bu yüzden tr-TR.
 *
 * KRİTİK: mutlak anlar İŞLETMENİN saat diliminde biçimlenir, ziyaretçinin
 * cihazınınkinde DEĞİL. Yurt dışındaki bir müşteri "10:00" seçtiğinde dükkanın
 * 10:00'ını kastediyordur; cihaz saatiyle biçimlemek onu farklı bir saate
 * bakıyor sanmasına yol açardı.
 */

/** Mutlak an -> "09:45" (işletmenin yerel saati). */
export function saatBicimle(isoAn: string, timezone: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoAn));
}

/** Mutlak an -> "5 Eylül 2026 Cumartesi, 09:45". */
export function tarihSaatBicimle(isoAn: string, timezone: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoAn));
}

/**
 * Takvim günü (YYYY-MM-DD) -> "5 Eylül Cumartesi".
 *
 * UTC'de biçimlenir: takvim günü saat dilimi taşımaz, yerel dilimde biçimlemek
 * cihazın offset'ine göre günü bir gün kaydırabilirdi.
 */
export function gunBicimle(isoGun: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(new Date(`${isoGun}T00:00:00Z`));
}

/** Takvim günü -> "Cts" / "5" gibi kısa iki satırlık gösterim için parçalar. */
export function gunKisaBicimle(isoGun: string): { gunAdi: string; gunNo: string } {
  const an = new Date(`${isoGun}T00:00:00Z`);
  const bicimle = (secenek: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", ...secenek }).format(an);

  return { gunAdi: bicimle({ weekday: "short" }), gunNo: bicimle({ day: "numeric" }) };
}

/** Opsiyonel fiyat (Decimal string) -> "150 ₺"; yoksa null. */
export function fiyatBicimle(fiyat: string | null): string | null {
  if (fiyat === null) return null;
  const sayi = Number(fiyat);
  if (!Number.isFinite(sayi)) return null;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: sayi % 1 === 0 ? 0 : 2,
  }).format(sayi);
}
