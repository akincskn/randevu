// `web-push` bir CommonJS paketidir. Adlandırılmış import (`import { sendNotification }`)
// bundler altında çalışır ama düz Node ESM'de "Named export not found" ile patlar
// (Node CJS'in dışa aktarımlarını statik olarak çözemez). Default import her iki
// ortamda da çalışır — bu yüzden bilinçli olarak namespace/default kullanılıyor.
import webpush from "web-push";

import { pushEnv } from "./env";
import { prisma } from "./prisma";

/**
 * Web Push gönderim katmanı — spec satır 36-38 (VAPID, ücretsiz, Firebase YOK).
 *
 * Bu dosya SADECE TAŞIMA işini yapar: bir işletmenin kayıtlı aboneliklerine
 * verilen içeriği gönderir ve ölü abonelikleri temizler. Bildirimlerin METNİ
 * `push-notifications.ts`'te üretilir (tek sorumluluk, CLAUDE.md §2 SOLID).
 */

/** CLAUDE.md §2: tüm dış çağrılarda timeout zorunlu. */
const ZAMAN_ASIMI_MS = 10_000;

/**
 * Push servisinin mesajı saklama süresi. 6 saat: bundan eskisi berber için
 * anlamını yitirir (randevu ya onaylanmış ya zaman aşımına uğramıştır).
 */
const TTL_SANIYE = 6 * 60 * 60;

/**
 * Aboneliğin ARTIK OLMADIĞINI bildiren HTTP kodları.
 * 410 Gone: kullanıcı bildirimi kapattı / tarayıcı verisini sildi.
 * 404 Not Found: endpoint push servisinde hiç yok.
 * Diğer kodlar (429, 5xx) geçici olabilir — abonelik SİLİNMEZ.
 */
const OLU_ABONELIK_KODLARI = new Set([404, 410]);

/** Service worker'ın (`public/sw.js`) beklediği payload sözleşmesi. */
export interface PushIcerigi {
  baslik: string;
  govde: string;
  /** Bildirime tıklanınca açılacak panel yolu. */
  url: string;
  /** Aynı etiketli eski bildirimi EZER — bildirim yığını oluşmaz. */
  etiket: string;
}

export interface PushSonucu {
  toplam: number;
  basarili: number;
  /** Ölü olduğu için veritabanından silinen abonelik sayısı. */
  silinen: number;
  basarisiz: number;
}

let vapidKuruldu = false;

/**
 * VAPID detaylarını süreçte BİR KEZ kurar.
 *
 * Modül yüklenirken değil, ilk gönderimde: `pushEnv()` eksik değişkende
 * fırlatır ve bu, build sırasında import edilen bir modülü patlatırdı.
 *
 * `pushEnv()` yalnızca VAPID değişkenlerine bakar (bkz. env.ts): bozuk bir push
 * yapılandırması veritabanı bağlantısını veya randevu akışını ETKİLEMEZ.
 */
function vapidKur(): void {
  if (vapidKuruldu) return;
  const env = pushEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidKuruldu = true;
}

/** Ölü aboneliği siler. Silme hatası gönderim sonucunu bozmaz, loglanır. */
async function oluAbonelikSil(id: string, endpoint: string): Promise<boolean> {
  try {
    // ID ile silinir, endpoint ile DEĞİL: aynı endpoint bu arada başka bir
    // işletmeye devredilmiş olabilir (bkz. push/subscribe route'u) ve o taze
    // kaydı silmek berberi sessizce bildirimsiz bırakırdı.
    await prisma.pushSubscription.delete({ where: { id } });
    console.warn("[push] ölü abonelik silindi:", endpoint);
    return true;
  } catch (error) {
    console.error("[push] ölü abonelik silinemedi:", endpoint, error);
    return false;
  }
}

interface AbonelikKaydi {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Tek bir aboneliğe gönderir.
 * @returns "basarili" | "silindi" | "basarisiz"
 *
 * YENİDEN DENEME YOK (kullanıcı kararı, 2026-08-16): tek atış. Geçici hata
 * yalnızca loglanır — bir sonraki randevu talebi zaten yeni bildirim üretir.
 */
async function tekAbonelieGonder(
  abonelik: AbonelikKaydi,
  yuk: string,
): Promise<"basarili" | "silindi" | "basarisiz"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: abonelik.endpoint,
        keys: { p256dh: abonelik.p256dh, auth: abonelik.auth },
      },
      yuk,
      { timeout: ZAMAN_ASIMI_MS, TTL: TTL_SANIYE, urgency: "high" },
    );
    return "basarili";
  } catch (error) {
    if (error instanceof webpush.WebPushError && OLU_ABONELIK_KODLARI.has(error.statusCode)) {
      const silindi = await oluAbonelikSil(abonelik.id, abonelik.endpoint);
      return silindi ? "silindi" : "basarisiz";
    }

    console.error(
      "[push] gönderim başarısız:",
      abonelik.endpoint,
      error instanceof webpush.WebPushError ? `HTTP ${error.statusCode} ${error.body}` : error,
    );
    return "basarisiz";
  }
}

/**
 * Bir işletmenin TÜM push aboneliklerine bildirim gönderir.
 *
 * ASLA FIRLATMAZ: push yardımcı bir özelliktir, çağıran ana akışı (randevu
 * oluşturma) bloklayamaz. Tüm hatalar yutulmaz — loglanır ve sayılır.
 */
export async function isletmeyePushGonder(
  businessId: string,
  icerik: PushIcerigi,
): Promise<PushSonucu> {
  const bos: PushSonucu = { toplam: 0, basarili: 0, silinen: 0, basarisiz: 0 };

  try {
    vapidKur();

    const abonelikler = await prisma.pushSubscription.findMany({
      where: { businessId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (abonelikler.length === 0) {
      // Berber henüz bildirim izni vermemiş — hata değil, normal durum.
      return bos;
    }

    const yuk = JSON.stringify(icerik);
    const sonuclar = await Promise.all(
      abonelikler.map((abonelik) => tekAbonelieGonder(abonelik, yuk)),
    );

    return {
      toplam: abonelikler.length,
      basarili: sonuclar.filter((s) => s === "basarili").length,
      silinen: sonuclar.filter((s) => s === "silindi").length,
      basarisiz: sonuclar.filter((s) => s === "basarisiz").length,
    };
  } catch (error) {
    console.error("[push] gönderim hazırlığı başarısız:", businessId, error);
    return bos;
  }
}
