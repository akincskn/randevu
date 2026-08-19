import { redis, REDIS_ZAMAN_ASIMI_MS } from "./redis";
import { withTimeout } from "./timeout";

/**
 * Günlük özetin gün içinde YALNIZCA BİR KEZ gönderilmesini sağlayan kilit.
 *
 * Süpürme cron'u 15 dakikada bir çalışır ve özet penceresi bundan geniştir
 * (bkz. `OZET_PENCERESI_DAKIKA`), yani aynı işletme aynı gün birden fazla turda
 * pencereye düşer. Kilit olmasaydı berber aynı sabah birkaç kez bildirim alırdı.
 *
 * Anahtar İŞLETMENİN YEREL takvim gününü taşır, UTC'yi değil: aksi halde
 * yerel saatle 03:00'te gün değişir ve sabah 09:00'daki özet "dünkü" anahtarla
 * çakışırdı (rate-limit.ts'teki aynı gerekçe, 2026-08-15 onaylı).
 */

/** 26 saat: bir yerel gün + yaz saati kayması ve cron gecikmesi için pay. */
const KILIT_TTL_SANIYE = 26 * 60 * 60;

/**
 * O gün için özet gönderme hakkını atomik olarak alır.
 *
 * `SET key value NX EX ttl` — Redis'te tek adımdır; iki eşzamanlı cron turundan
 * yalnızca biri `true` alır.
 *
 * FAIL-OPEN (kullanıcı kararı, 2026-08-16): Upstash'e ULAŞILAMAZSA kilit kontrolü
 * ATLANIR ve özet yine de gönderilir. Gerekçe mevcut rate-limit politikasıyla
 * aynı yöndedir — bir altyapı kesintisinin spec satır 57'deki bildirimi tamamen
 * susturması, nadir bir çift bildirimden daha maliyetli görüldü. Hata SESSİZCE
 * yutulmaz, loglanır (CLAUDE.md §2).
 */
export async function gunlukOzetKilidiAl(businessId: string, yerelGun: string): Promise<boolean> {
  const anahtar = `digest:${businessId}:${yerelGun}`;

  try {
    const sonuc = await withTimeout(
      redis().set(anahtar, "1", { nx: true, ex: KILIT_TTL_SANIYE }),
      REDIS_ZAMAN_ASIMI_MS,
      "Upstash günlük özet kilidi",
    );

    // Upstash `SET ... NX` başarısızsa null döner (anahtar zaten vardı).
    return sonuc === "OK";
  } catch (error) {
    console.error(
      "[cron] günlük özet kilidi alınamadı, kontrol ATLANIYOR (fail-open):",
      anahtar,
      error,
    );
    return true;
  }
}
