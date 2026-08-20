import { prisma } from "./prisma";
import { withTimeout } from "./timeout";

/**
 * TAMAMLANMA SÜPÜRMESİ — biten randevuları COMPLETED'a çevirir.
 *
 * `expiry-sweep.ts`'ten AYRI bir modül: o dosya çalışma saati birikimini ve
 * günlük özeti yürütüyor, bu karar ise takvimden TAMAMEN bağımsız (tek koşul
 * `endsAt`). Aynı dosyada birleştirmek iki ilgisiz sorumluluğu yan yana koyar
 * ve `expiry-sweep.ts`'i 200 satır sınırının üstüne taşırdı (CLAUDE.md §2).
 *
 * Kural (kullanıcı kararı, 2026-08-20): berberin ONAYLADIĞI bir randevunun
 * BİTİŞ saati geçtiğinde randevu COMPLETED olur.
 *   - Eşik `startsAt` değil `endsAt`'tir: süren bir randevuya "tamamlandı"
 *     denmez ve berber randevu devam ederken hâlâ iptal edebilmelidir.
 *   - YALNIZCA CONFIRMED dönüşür. PENDING randevular `expiry.ts`'in kuralıyla
 *     zaten EXPIRED olur (berber onaylamadı ≠ randevu gerçekleşti);
 *     CANCELLED/EXPIRED/NO_SHOW kayıtlara dokunulmaz.
 *   - NO_SHOW bu sürümde YAZILMAZ (kullanıcı kararı, 2026-08-20): berberin
 *     "gelmedi" işaretlemesi kapsam dışı, enum'daki değer ileriye dönük durur.
 *
 * EXCLUDE kısıtı açısından güvenlidir: CONFIRMED de COMPLETED de slotu TUTAR,
 * yani kısıtın kapsamındaki satır sayısı değişmez, yeni çakışma üretilemez.
 */

/** Veritabanı çağrıları için zaman aşımı (CLAUDE.md §2: tüm dış çağrılarda zorunlu). */
const DB_ZAMAN_ASIMI_MS = 10_000;

/**
 * Bitiş saati geçmiş CONFIRMED randevuları COMPLETED yapar; güncellenen sayıyı döner.
 *
 * Tek bir `updateMany` yeter — işletme bazında dönmeye gerek yok, çünkü karar
 * hiçbir işletme ayarına (saat dilimi, çalışma saati, istisna) bakmıyor:
 * `endsAt` mutlak bir zaman damgasıdır.
 */
export async function tamamlananlariIsaretle(simdi: Date = new Date()): Promise<number> {
  const sonuc = await withTimeout(
    prisma.appointment.updateMany({
      where: { status: "CONFIRMED", endsAt: { lte: simdi } },
      data: { status: "COMPLETED" },
    }),
    DB_ZAMAN_ASIMI_MS,
    "Prisma tamamlanma güncellemesi",
  );

  return sonuc.count;
}
