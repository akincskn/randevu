import type { NextRequest } from "next/server";

import { toErrorResponse } from "@/lib/api-error";
import { tamamlananlariIsaretle } from "@/lib/completion-sweep";
import { cronYetkisiDogrula } from "@/lib/cron-auth";
import { zamanAsimiSupurmesiCalistir } from "@/lib/expiry-sweep";

/**
 * POST /api/cron/expire-appointments — zaman aşımı süpürmesi (spec satır 61-64),
 * günlük bekleyen özeti (spec satır 67) ve tamamlanma süpürmesi.
 *
 * Tamamlanma süpürmesi (bitiş saati geçmiş CONFIRMED -> COMPLETED, kullanıcı
 * kararı 2026-08-20) aynı tetiklemeye BİNDİRİLDİ: ikisi de periyodik durum
 * bakımı yapıyor ve ayrı bir QStash zamanlaması ikinci bir dış bağımlılık
 * (ve ikinci bir sessizce ölme noktası) demek olurdu. Yol adı geriye dönük
 * uyumluluk için değişmedi — QStash zamanlaması bu adrese kayıtlı.
 *
 * Upstash QStash tarafından 15 dakikada bir çağrılır (kullanıcı kararı, 2026-08-16;
 * Vercel Cron ücretsiz planda günde 1 tetikleme verdiği için elenmişti). Koruma
 * `Authorization: Bearer <CRON_SECRET>` başlığıdır — bkz. `lib/cron-auth.ts`.
 *
 * YALNIZCA POST: QStash POST gönderir. GET eklenmedi çünkü tarayıcıda kazara
 * açılan bir adresin randevu durumlarını değiştirmesi istenmez.
 */

/** Süpürme tüm işletmeleri gezer ve push gönderir; varsayılan 10 sn yetmeyebilir. */
export const maxDuration = 60;

/** Cron her çağrıda GÜNCEL veriyi okumalı — hiçbir katmanda önbelleklenmemeli. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    cronYetkisiDogrula(request);

    const basladi = Date.now();
    const simdi = new Date();
    const sonuc = await zamanAsimiSupurmesiCalistir(simdi);

    // Tamamlanma güncellemesi zaman aşımı süpürmesinden BAĞIMSIZ raporlanır ve
    // kendi hatası turu düşürmez: biri başarısız olsa da diğerinin sonucu
    // kalıcıdır (expiry-sweep içindeki işletme bazlı hata politikasıyla aynı).
    let tamamlanan = 0;
    try {
      tamamlanan = await tamamlananlariIsaretle(simdi);
    } catch (error) {
      console.error("[cron] tamamlanma güncellemesi başarısız:", error);
    }

    // Cron'un çıktısı kimseye gösterilmez; tek gözlem noktası sunucu logudur.
    console.info("[cron] durum süpürmesi tamamlandı:", {
      ...sonuc,
      tamamlanan,
      sureMs: Date.now() - basladi,
    });

    return Response.json({ ...sonuc, tamamlanan }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
