import type { AppointmentDetailDto } from "@/lib/dto";

/**
 * Randevu durumunun müşteriye görünen karşılığı.
 *
 * Şemadaki ALTI durumun tamamı karşılanır (bkz. `AppointmentStatus`); hiçbir
 * varsayılan/`default` dalı yok — enum'a yeni bir durum eklenirse TypeScript
 * burayı derleme hatasıyla işaret eder, sessizce boş metin göstermez.
 *
 * Metinler spec satır 23-30'daki akışı anlatır: PENDING henüz onay bekliyordur,
 * onay mesajı berber tarafından MANUEL olarak WhatsApp'tan gönderilir (satır 28).
 */

export type Durum = AppointmentDetailDto["status"];

export interface DurumGorunumu {
  baslik: string;
  aciklama: string;
  sinif: string;
  iptalEdilebilir: boolean;
  /**
   * Sayfa adresi kutusunun üstündeki cümle (bkz. `page-link.tsx`). Adres altı
   * durumda da gösterilir — müşterinin hesabı yoktur, bu link randevuya geri
   * dönmesinin tek yoludur (spec satır 50). Ancak "kontrol edebilirsiniz" ifadesi
   * düşmüş bir randevu için yanıltıcı olacağından metin duruma göre ayrılır.
   */
  linkAciklamasi: string;
}

const AKTIF_LINK = "Randevunuzu bu sayfadan kontrol edebilirsiniz:";
const ARSIV_LINK = "Bu sayfanın adresi:";

const BEKLEME =
  "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";
const OLUMLU =
  "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
const NOTR =
  "border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

const GORUNUMLER: Record<Durum, DurumGorunumu> = {
  PENDING: {
    baslik: "Talebiniz alındı",
    aciklama: "Berber onayladığında WhatsApp üzerinden bilgilendirileceksiniz.",
    sinif: BEKLEME,
    iptalEdilebilir: true,
    linkAciklamasi: AKTIF_LINK,
  },
  CONFIRMED: {
    baslik: "Randevunuz onaylandı",
    aciklama: "Sizi belirtilen saatte bekliyoruz.",
    sinif: OLUMLU,
    iptalEdilebilir: true,
    linkAciklamasi: AKTIF_LINK,
  },
  CANCELLED: {
    baslik: "Randevu iptal edildi",
    aciklama: "Bu randevu iptal edilmiştir. Yeni bir randevu oluşturabilirsiniz.",
    sinif: NOTR,
    iptalEdilebilir: false,
    linkAciklamasi: ARSIV_LINK,
  },
  EXPIRED: {
    baslik: "Talebin süresi doldu",
    aciklama: "Bu talep zamanında onaylanmadığı için düştü. Yeni bir randevu oluşturabilirsiniz.",
    sinif: NOTR,
    iptalEdilebilir: false,
    linkAciklamasi: ARSIV_LINK,
  },
  COMPLETED: {
    baslik: "Randevu tamamlandı",
    aciklama: "Bu randevu gerçekleşti.",
    sinif: NOTR,
    iptalEdilebilir: false,
    linkAciklamasi: ARSIV_LINK,
  },
  NO_SHOW: {
    baslik: "Randevuya gelinmedi",
    aciklama: "Bu randevu gelinmedi olarak işaretlendi.",
    sinif: NOTR,
    iptalEdilebilir: false,
    linkAciklamasi: ARSIV_LINK,
  },
};

export function durumGorunumu(durum: Durum): DurumGorunumu {
  return GORUNUMLER[durum];
}
