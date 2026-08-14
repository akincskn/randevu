import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { pushAbonelikSemasi } from "@/lib/schemas";
import { oturumZorunlu } from "@/lib/session";

/**
 * POST /api/push/subscribe — berberin tarayıcı push aboneliğini kaydeder.
 *
 * Spec satır 36-38 (VAPID, Firebase YOK). Bu uç yalnızca aboneliği SAKLAR;
 * bildirim GÖNDERİMİ Faz 5'in konusudur (bkz. ROADMAP.md).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const abonelik = pushAbonelikSemasi.parse(govde);

    // upsert: tarayıcı aynı endpoint'i yeniden gönderebilir (sayfa her açılışında
    // subscribe çağrılır). `endpoint` unique olduğu için mükerrer kayıt yerine
    // güncelleme yapılır; anahtarlar döndüğünde de yeni değerler yazılır.
    const kayit = await prisma.pushSubscription.upsert({
      where: { endpoint: abonelik.endpoint },
      create: {
        businessId,
        endpoint: abonelik.endpoint,
        p256dh: abonelik.keys.p256dh,
        auth: abonelik.keys.auth,
      },
      update: {
        businessId,
        p256dh: abonelik.keys.p256dh,
        auth: abonelik.keys.auth,
      },
      select: { endpoint: true, createdAt: true },
    });

    return Response.json(
      { endpoint: kayit.endpoint, createdAt: kayit.createdAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
