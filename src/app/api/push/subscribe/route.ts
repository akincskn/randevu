import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { pushAbonelikSemasi } from "@/lib/schemas";
import { oturumZorunlu } from "@/lib/session";

/**
 * POST /api/push/subscribe — berberin tarayıcı push aboneliğini kaydeder.
 *
 * Spec satır 55-57 (VAPID, Firebase YOK). Bu uç yalnızca aboneliği SAKLAR;
 * bildirim GÖNDERİMİ Faz 5'in konusudur (bkz. ROADMAP.md).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const abonelik = pushAbonelikSemasi.parse(govde);

    const mevcut = await prisma.pushSubscription.findUnique({
      where: { endpoint: abonelik.endpoint },
      select: { businessId: true },
    });

    // Endpoint BAŞKA bir işletmeye bağlıysa devir meşrudur: aynı cihazda A berberi
    // çıkıp B giriş yaptığında tarayıcı aynı endpoint'i üretir. Ancak eski kayıt
    // GÜNCELLENMEZ, SİLİNİP yeniden oluşturulur — böylece A'nın anahtarlarıyla
    // B'nin anahtarları aynı satırda karışmaz ve devir createdAt'ten izlenebilir.
    if (mevcut && mevcut.businessId !== businessId) {
      await prisma.pushSubscription.delete({ where: { endpoint: abonelik.endpoint } });
    }

    // Aynı işletme tekrar gönderirse (sayfa her açılışında subscribe çağrılır)
    // mükerrer kayıt yerine anahtarlar güncellenir.
    const kayit = await prisma.pushSubscription.upsert({
      where: { endpoint: abonelik.endpoint },
      create: {
        businessId,
        endpoint: abonelik.endpoint,
        p256dh: abonelik.keys.p256dh,
        auth: abonelik.keys.auth,
      },
      update: {
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
