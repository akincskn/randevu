import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { iptalSemasi } from "@/lib/schemas";
import { sessionTokenCoz, SESSION_COOKIE } from "@/lib/session";

/** Sabit süreli token karşılaştırması — zamanlama saldırısıyla token tahminini engeller. */
function tokenEsit(gelen: string, beklenen: string): boolean {
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * PATCH /api/appointments/[id]/cancel — randevu iptali.
 *
 * İKİ yetkilendirme yolu vardır ve ikisi de spec'e dayanır:
 *   - Müşteri: gövdede `publicToken` gönderir (spec satır 71 — iptal linki
 *     kriptografik rastgele token taşır; hesap yoktur, satır 79).
 *   - Berber: oturum cookie'si ile gelir, kendi işletmesinin randevusunu iptal eder.
 *
 * İkisi de yoksa 401. Yanlış token/başka işletme ise 403.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;

    const govde = await request.json().catch(() => ({}));
    const { publicToken } = iptalSemasi.parse(govde);
    const oturumBusinessId = sessionTokenCoz(request.cookies.get(SESSION_COOKIE)?.value);

    if (!publicToken && !oturumBusinessId) {
      throw new ApiError(
        "UNAUTHORIZED",
        401,
        "İptal için randevu linkinizi kullanın veya giriş yapın.",
      );
    }

    const randevu = await prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    if (!randevu) {
      throw new ApiError("NOT_FOUND", 404, "Randevu bulunamadı.");
    }

    const musteriYetkili = publicToken !== undefined && tokenEsit(publicToken, randevu.publicToken);
    const berberYetkili = oturumBusinessId !== null && oturumBusinessId === randevu.businessId;

    if (!musteriYetkili && !berberYetkili) {
      throw new ApiError("FORBIDDEN", 403, "Bu randevuyu iptal etme yetkiniz yok.");
    }

    // Zaten iptal edilmiş bir randevuyu tekrar iptal etmek hata değildir (idempotent):
    // müşteri linke iki kez tıklarsa hata ekranı görmemeli.
    if (randevu.status === "CANCELLED") {
      return Response.json(toAppointmentDto(randevu));
    }

    if (randevu.status !== "PENDING" && randevu.status !== "CONFIRMED") {
      throw new ApiError(
        "INVALID_STATE",
        409,
        `Bu randevu iptal edilemez. Mevcut durum: ${randevu.status}.`,
      );
    }

    const guncel = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    return Response.json(toAppointmentDto(guncel));
  } catch (error) {
    return toErrorResponse(error);
  }
}
