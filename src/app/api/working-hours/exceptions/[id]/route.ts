import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { oturumZorunlu } from "@/lib/session";

/**
 * DELETE /api/working-hours/exceptions/[id] — istisnayı kaldırır (spec satır 19).
 *
 * Silindiğinde o gün HAFTALIK kayda geri döner; istisna bir "ezme" kaydıdır,
 * kaldırmak günü kapatmaz (bkz. `gunlukAralikCoz`).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);
    const { id } = await context.params;

    // Sahiplik kontrolü: yalnızca id ile silmek, başka bir işletmenin
    // istisnasını kaldırmaya izin verirdi.
    const istisna = await prisma.workingHoursException.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!istisna) {
      throw new ApiError("NOT_FOUND", 404, "İstisna bulunamadı.");
    }

    await prisma.workingHoursException.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
