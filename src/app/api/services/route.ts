import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import {
  SERVICE_ADMIN_SELECT,
  type ServiceAdminDto,
  toServiceAdminDto,
} from "@/lib/dto-dashboard";
import { prisma } from "@/lib/prisma";
import { hizmetOlusturSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";

/**
 * Hizmet yönetimi — spec satır 17 ("isim, süre (dakika), opsiyonel fiyat").
 *
 * Her iki metot da oturum ister ve YALNIZCA oturumdaki işletmenin hizmetlerine
 * dokunur; `businessId` istemciden ASLA alınmaz (Faz 2'de `push/subscribe`'da
 * bu tam olarak bir güvenlik açığıydı, bkz. commit 728b3dc).
 */

/** GET /api/services — panel listesi. Pasif hizmetler DE döner. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const hizmetler = await prisma.service.findMany({
      where: { businessId },
      select: SERVICE_ADMIN_SELECT,
      orderBy: { createdAt: "asc" },
    });

    return Response.json({ services: hizmetler.map(toServiceAdminDto) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/services — yeni hizmet. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });
    const girdi = hizmetOlusturSemasi.parse(govde);

    const hizmet = await prisma.service.create({
      data: {
        businessId,
        name: girdi.name,
        durationMinutes: girdi.durationMinutes,
        price: girdi.price ?? null,
        isActive: girdi.isActive ?? true,
      },
      select: SERVICE_ADMIN_SELECT,
    });

    const yanit: ServiceAdminDto = toServiceAdminDto(hizmet);
    return Response.json(yanit, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
