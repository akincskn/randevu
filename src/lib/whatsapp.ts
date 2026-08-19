import type { AppointmentDto } from "./dto";

/**
 * Spec satır 27-29: onay sonrası ekranda bir WhatsApp linki belirir; berber tıklar,
 * KENDİ WhatsApp'ı açılır, mesajı MANUEL gönderir.
 *
 * WhatsApp Business API YOK, resmi entegrasyon YOK, otomatik gönderim YOK
 * (spec satır 74 bunu açıkça kapsam dışı bırakıyor). Burada üretilen tek şey
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
 * Onay mesajının hazır metnini ve WhatsApp linkini üretir (spec satır 27).
 *
 * @param detayUrl Müşterinin randevu detayını göreceği public link (spec satır 30).
 */
export function onayWhatsappLinki(
  randevu: AppointmentDto,
  timezone: string,
  detayUrl: string,
): string {
  const satirlar = [
    `Merhaba ${randevu.customerName},`,
    "",
    `${randevu.business.name} randevunuz onaylandı.`,
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
