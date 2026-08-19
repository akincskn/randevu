import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { BUSINESS_PUBLIC_DTO_SELECT, toBusinessPublicDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { okumaKotasiTuket } from "@/lib/read-limit";

/**
 * GET /api/businesses/[slug] — public booking sayfasının açılış verisi (spec satır 22).
 *
 * İşletme bilgisi + hizmet listesini döner. Sayfa Prisma'ya DOĞRUDAN erişemez
 * (STRUCTURE.md satır 88-89); public veri her zaman bu katmandan ve DTO'dan geçer.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    await okumaKotasiTuket(request, "business");

    const { slug } = await context.params;
    if (!slug) {
      throw new ApiError("VALIDATION_ERROR", 400, "İşletme belirtilmedi.");
    }

    const isletme = await prisma.business.findUnique({
      where: { slug },
      select: BUSINESS_PUBLIC_DTO_SELECT,
    });

    if (!isletme) {
      throw new ApiError("NOT_FOUND", 404, "İşletme bulunamadı.");
    }

    return Response.json(toBusinessPublicDto(isletme));
  } catch (error) {
    return toErrorResponse(error);
  }
}
