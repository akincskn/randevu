import { randomBytes } from "node:crypto";

/**
 * İşletme adından public link slug'ı üretir (spec satır 22: "işletmenin public linki").
 *
 * Türkçe karakterler ASCII karşılıklarına çevrilir — `normalize("NFD")` ğ/ş/ı
 * harflerini doğru ayrıştırmadığı için eşleme elle yapılır.
 */
const TR_HARITA: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

export function slugTemelUret(ad: string): string {
  const temel = ad
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (h) => TR_HARITA[h] ?? h)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return temel.length > 0 ? temel : "isletme";
}

/**
 * Slug'a kısa rastgele bir sonek ekler.
 *
 * Neden sayaçla değil rastgele: "berber-ahmet-2" gibi sıralı sonekler kaç
 * işletmenin kayıtlı olduğunu sızdırır ve çakışma çözümü için ekstra sorgu
 * gerektirir. 4 baytlık sonek çakışma olasılığını pratikte sıfırlar.
 */
export function slugSonekEkle(temel: string): string {
  return `${temel}-${randomBytes(3).toString("hex")}`;
}
