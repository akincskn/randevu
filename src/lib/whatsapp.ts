import type { AppointmentDto } from "./dto";

/**
 * Spec satır 27-29: onay sonrası ekranda bir WhatsApp linki belirir; berber tıklar,
 * KENDİ WhatsApp'ı açılır, mesajı MANUEL gönderir.
 *
 * WhatsApp Business API YOK, resmi entegrasyon YOK, otomatik gönderim YOK
 * (spec satır 84 bunu açıkça kapsam dışı bırakıyor). Burada üretilen tek şey
 * bir URL'dir — bu modül hiçbir mesaj göndermez, dış servise çağrı yapmaz.
 *
 * Hedef `wa.me` DEĞİL, `api.whatsapp.com/send/`dir. Gerekçe ölçülmüştür: `wa.me`
 * isteği 302 ile `api.whatsapp.com`'a yönlendirirken `text` parametresindeki
 * BMP dışı karakterleri (📅 ✂️ 📍) U+FFFD'ye çeviriyor —
 *   istek  ...?text=%F0%9F%93%85 -> Location: ...&text=%EF%BF%BD
 * Aynı adres doğrudan çağrıldığında yönlendirme hiç olmuyor (200) ve emoji
 * bozulmadan geçiyor. Türkçe karakterler her iki yolda da sağlamdı.
 */

/** WhatsApp uluslararası biçim ister: baştaki + ve ayraçlar olmadan, ülke kodu dahil. */
function waNumaraBicimle(ulusalNumara: string): string {
  const rakamlar = ulusalNumara.replace(/\D/g, "");
  return rakamlar.startsWith("90") ? rakamlar : `90${rakamlar}`;
}

function tarihBicimle(isoAn: string, timezone: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoAn));
}

/**
 * Mesajın ORTAK gövdesi: selamlama, özet cümlesi, tarih/hizmet/adres bloğu ve
 * detay linki. Onay ve güncelleme mesajları yalnızca özet cümlesinde ayrışır —
 * blok tek yerde tutulmazsa iki mesaj biçimi zamanla birbirinden uzaklaşır.
 *
 * @param detayUrl Müşterinin randevu detayını göreceği public link (spec satır 30).
 */
function whatsappLinki(
  randevu: AppointmentDto,
  timezone: string,
  detayUrl: string,
  /** Selamlama ile detay bloğu arasındaki tek cümlelik özet. */
  ozet: string,
): string {
  const satirlar = [
    `Merhaba ${randevu.customerName},`,
    "",
    ozet,
    "",
    `📅 ${tarihBicimle(randevu.startsAt, timezone)}`,
    `✂️ ${randevu.service.name} (${randevu.service.durationMinutes} dk)`,
  ];

  if (randevu.business.address) {
    satirlar.push(`📍 ${randevu.business.address}`);
  }

  satirlar.push("", `Randevu detayı: ${detayUrl}`);

  const metin = encodeURIComponent(satirlar.join("\n"));
  const numara = waNumaraBicimle(randevu.customerPhone);
  return `https://api.whatsapp.com/send/?phone=${numara}&text=${metin}&type=phone_number&app_absent=0`;
}

export function onayWhatsappLinki(
  randevu: AppointmentDto,
  timezone: string,
  detayUrl: string,
): string {
  return whatsappLinki(
    randevu,
    timezone,
    detayUrl,
    `${randevu.business.name} randevunuz onaylandı.`,
  );
}

/**
 * Berber randevuyu panelden DÜZENLEDİĞİNDE üretilen mesaj (kullanıcı kararı, 2026-08-20).
 *
 * Onay mesajıyla AYNI gövdeyi paylaşır, yalnızca özet cümlesi ayrışır: müşterinin
 * gördüğü tarih/hizmet/adres bloğu iki mesajda da aynı kalmalı, yoksa iki biçim
 * zamanla ayrışır. Bu link de OTOMATİK GÖNDERİLMEZ — berber tıklarsa gider
 * (spec satır 28-29, satır 84).
 */
export function guncellemeWhatsappLinki(
  randevu: AppointmentDto,
  timezone: string,
  detayUrl: string,
): string {
  return whatsappLinki(
    randevu,
    timezone,
    detayUrl,
    `${randevu.business.name} randevunuz güncellendi. Yeni bilgiler aşağıda:`,
  );
}
