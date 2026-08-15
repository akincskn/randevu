import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDetailDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { okumaKotasiTuket } from "@/lib/read-limit";

/**
 * GET /api/appointments/token/[token] — müşteri randevu detayı (spec satır 30).
 *
 * Yetkilendirme TOKEN'IN KENDİSİDİR: spec satır 42 gereği `publicToken`
 * kriptografik olarak rastgeledir (bkz. `tokens.ts`), sıralı id değildir —
 * tahmin edilemez. Hesap yoktur (spec satır 50), oturum aranmaz.
 *
 * Bulunamayan token 404 döner; "geçersiz" ile "başkasının randevusu" ayrımı
 * BİLEREK yapılmaz — ayrım, var olan token'ları numaralandırmayı kolaylaştırırdı.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    await okumaKotasiTuket(request, "appointment");

    const { token } = await context.params;
    if (!token) {
      throw new ApiError("VALIDATION_ERROR", 400, "Randevu linki geçersiz.");
    }

    const randevu = await prisma.appointment.findUnique({
      where: { publicToken: token },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    if (!randevu) {
      throw new ApiError("NOT_FOUND", 404, "Randevu bulunamadı.");
    }

    return Response.json(toAppointmentDetailDto(randevu));
  } catch (error) {
    return toErrorResponse(error);
  }
}
