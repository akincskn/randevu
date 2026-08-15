import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { SERVICE_ADMIN_SELECT, toServiceAdminDto } from "@/lib/dto-dashboard";
import { prisma } from "@/lib/prisma";
import { hizmetGuncelleSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";

/** Prisma yabancı anahtar ihlali — `Appointment.serviceId` RESTRICT. */
const PRISMA_FK_IHLALI = "P2003";

/**
 * Hizmetin oturumdaki işletmeye ait olduğunu doğrular.
 *
 * `findFirst` + `businessId` şart: yalnızca id ile sorgulamak, başka bir
 * işletmenin hizmetini düzenlemeye/silmeye izin verirdi.
 */
async function sahipHizmetiBul(id: string, businessId: string) {
  const hizmet = await prisma.service.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!hizmet) {
    throw new ApiError("NOT_FOUND", 404, "Hizmet bulunamadı.");
  }
  return hizmet;
}

/** PATCH /api/services/[id] — isim, süre, fiyat, aktif/pasif güncelleme. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);
    const { id } = await context.params;

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });
    const girdi = hizmetGuncelleSemasi.parse(govde);

    await sahipHizmetiBul(id, businessId);

    const guncel = await prisma.service.update({
      where: { id },
      data: {
        name: girdi.name,
        durationMinutes: girdi.durationMinutes,
        // `price` üç durumu ayırır: gönderilmedi (dokunma), null (fiyatı kaldır),
        // değer (yaz). `?? null` yazılsaydı "gönderilmedi" ile "kaldır" karışırdı.
        ...(girdi.price !== undefined ? { price: girdi.price } : {}),
        isActive: girdi.isActive,
      },
      select: SERVICE_ADMIN_SELECT,
    });

    return Response.json(toServiceAdminDto(guncel));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/services/[id] — hizmeti siler.
 *
 * Randevusu olan hizmet SİLİNEMEZ: `Appointment.service` ilişkisi
 * `onDelete: Restrict`'tir ve bu bilinçlidir — geçmiş randevu, hangi hizmet için
 * alındığını kaybetmemeli. Bu durumda 409 döner ve pasife alma önerilir
 * (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-16).
 *
 * Sayım ve silme TEK transaction içinde yapılır: ayrı yapılsaydı, sayımdan sonra
 * silmeden önce gelen bir randevu, silmeyi ham veritabanı hatasına düşürürdü.
 * Yine de P2003 yakalanır — transaction dışı bir yarışa karşı son savunma.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);
    const { id } = await context.params;

    await sahipHizmetiBul(id, businessId);

    try {
      await prisma.$transaction(async (tx) => {
        const randevuSayisi = await tx.appointment.count({ where: { serviceId: id } });
        if (randevuSayisi > 0) {
          throw new ApiError(
            "INVALID_STATE",
            409,
            `Bu hizmete bağlı ${randevuSayisi} randevu var, silinemez. Pasife almayı düşünebilirsiniz.`,
          );
        }
        await tx.service.delete({ where: { id } });
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        if ((error as { code?: unknown }).code === PRISMA_FK_IHLALI) {
          throw new ApiError(
            "INVALID_STATE",
            409,
            "Bu hizmete bağlı randevular var, silinemez. Pasife almayı düşünebilirsiniz.",
          );
        }
      }
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
