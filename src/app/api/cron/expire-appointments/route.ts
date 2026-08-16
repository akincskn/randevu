import type { NextRequest } from "next/server";

import { toErrorResponse } from "@/lib/api-error";
import { cronYetkisiDogrula } from "@/lib/cron-auth";
import { zamanAsimiSupurmesiCalistir } from "@/lib/expiry-sweep";

/**
 * POST /api/cron/expire-appointments — zaman aşımı süpürmesi (spec satır 32-35)
 * ve günlük bekleyen özeti (spec satır 38).
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
    const sonuc = await zamanAsimiSupurmesiCalistir();

    // Cron'un çıktısı kimseye gösterilmez; tek gözlem noktası sunucu logudur.
    console.info("[cron] zaman aşımı süpürmesi tamamlandı:", {
      ...sonuc,
      sureMs: Date.now() - basladi,
    });

    return Response.json(sonuc, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
