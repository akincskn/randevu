/**
 * Gece yarısından itibaren DAKİKA <-> "HH:MM" metni.
 *
 * `WorkingHours.opensAtMinute` gibi alanlar dakika tutar (tz taşımayan yerel
 * duvar saati, bkz. `prisma/schema.prisma`), ama `<input type="time">` "HH:MM"
 * ister. Çevrim tek yerde durur ki iki yön asla ayrışmasın.
 */

/** 540 -> "09:00". Aralık dışı değer null döner (çağıran boş alan gösterir). */
export function dakikaToSaat(dakika: number | null): string {
  if (dakika === null || !Number.isInteger(dakika) || dakika < 0 || dakika > 24 * 60) {
    return "";
  }
  const saat = Math.floor(dakika / 60);
  const kalan = dakika % 60;
  return `${String(saat).padStart(2, "0")}:${String(kalan).padStart(2, "0")}`;
}

/** "09:00" -> 540. Çözümlenemezse null. */
export function saatToDakika(metin: string): number | null {
  const eslesme = /^(\d{1,2}):(\d{2})$/.exec(metin.trim());
  if (!eslesme) return null;

  const saat = Number(eslesme[1]);
  const dakika = Number(eslesme[2]);
  if (saat > 24 || dakika > 59) return null;

  const toplam = saat * 60 + dakika;
  return toplam > 24 * 60 ? null : toplam;
}

export const GUN_ADLARI = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;
