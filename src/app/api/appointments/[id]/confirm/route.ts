import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { randevuDetayUrl } from "@/lib/appointment-links";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { oturumZorunlu } from "@/lib/session";
import { onayWhatsappLinki } from "@/lib/whatsapp";

/**
 * PATCH /api/appointments/[id]/confirm — berber randevuyu onaylar (spec satır 25-29).
 *
 * Yanıtta `whatsappUrl` döner; mesajı GÖNDERMEZ. Berber linke tıklayıp kendi
 * WhatsApp'ından manuel gönderir (spec satır 28-29, satır 74: resmi API kapsam dışı).
 *
 * Next.js 16: dinamik segment `params` bir Promise'tir, await edilmelidir.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const oturumBusinessId = oturumZorunlu(request);
    const { id } = await context.params;

    const randevu = await prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    if (!randevu) {
      throw new ApiError("NOT_FOUND", 404, "Randevu bulunamadı.");
    }

    // Sahiplik kontrolü: berber yalnızca KENDİ işletmesinin randevusunu onaylayabilir.
    if (randevu.businessId !== oturumBusinessId) {
      throw new ApiError("FORBIDDEN", 403, "Bu randevu sizin işletmenize ait değil.");
    }

    if (randevu.status !== "PENDING") {
      throw new ApiError(
        "INVALID_STATE",
        409,
        `Yalnızca bekleyen randevular onaylanabilir. Mevcut durum: ${randevu.status}.`,
      );
    }

    const guncel = await prisma.appointment.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    const isletme = await prisma.business.findUniqueOrThrow({
      where: { id: oturumBusinessId },
      select: { slug: true, timezone: true },
    });

    const dto = toAppointmentDto(guncel);

    const detayUrl = randevuDetayUrl(isletme.slug, guncel.publicToken, request.nextUrl.origin);

    return Response.json({
      appointment: dto,
      whatsappUrl: onayWhatsappLinki(dto, isletme.timezone, detayUrl),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
