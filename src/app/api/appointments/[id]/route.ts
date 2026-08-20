import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { randevuDetayUrl } from "@/lib/appointment-links";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { randevuGuncelleSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";
import { guncellemeWhatsappLinki } from "@/lib/whatsapp";

/**
 * PATCH /api/appointments/[id] — berber randevuyu panelden düzenler
 * (kullanıcı kararı, 2026-08-20).
 *
 * Manuel eklemeyle (`/api/appointments/manual`) AYNI kuralları uygular; tek fark
 * var olan bir satırı güncellemesidir:
 *   - Yalnızca oturum sahibinin KENDİ işletmesinin randevusu (403 aksi halde).
 *   - Yalnızca PENDING veya CONFIRMED düzenlenebilir; iptal edilmiş, süresi
 *     dolmuş veya tamamlanmış kayıt değiştirilemez (409).
 *   - Bitmiş randevu düzenlenemez — iptal kuralıyla AYNI eşik (`endsAt`).
 *   - Yeni saat geçmişte olamaz; yeni hizmet aktif ve aynı işletmeye ait olmalı.
 *   - Çakışmayı `Appointment_no_overlap_excl` verir (409 SLOT_TAKEN). Satırın
 *     KENDİSİNİ güncellemek kısıtı ihlal etmez, yani saat aynı bırakılabilir.
 *
 * DURUM DEĞİŞTİRİLMEZ: PENDING düzenlenince PENDING kalır. Onay ve iptal kendi
 * uç noktalarına aittir; burada durum yazmak o akışların kurallarını baypas ederdi.
 */
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
    const talep = randevuGuncelleSemasi.parse(govde);

    const mevcut = await prisma.appointment.findUnique({
      where: { id },
      select: {
        businessId: true,
        status: true,
        endsAt: true,
        serviceId: true,
        startsAt: true,
        service: { select: { durationMinutes: true } },
      },
    });
    if (!mevcut) {
      throw new ApiError("NOT_FOUND", 404, "Randevu bulunamadı.");
    }
    if (mevcut.businessId !== businessId) {
      throw new ApiError("FORBIDDEN", 403, "Bu randevu sizin işletmenize ait değil.");
    }
    if (mevcut.status !== "PENDING" && mevcut.status !== "CONFIRMED") {
      throw new ApiError(
        "INVALID_STATE",
        409,
        `Bu randevu düzenlenemez. Mevcut durum: ${mevcut.status}.`,
      );
    }
    if (mevcut.endsAt.getTime() <= Date.now()) {
      throw new ApiError("INVALID_STATE", 409, "Geçmiş bir randevu düzenlenemez.");
    }

    // `businessId` filtresi ŞART: aksi halde berber, id'sini bildiği başka bir
    // dükkanın hizmetini kendi randevusuna bağlayabilirdi (manuel akışla aynı).
    const hizmet =
      talep.serviceId === undefined || talep.serviceId === mevcut.serviceId
        ? { id: mevcut.serviceId, durationMinutes: mevcut.service.durationMinutes }
        : await prisma.service.findFirst({
            where: { id: talep.serviceId, businessId, isActive: true },
            select: { id: true, durationMinutes: true },
          });
    if (!hizmet) {
      throw new ApiError("NOT_FOUND", 404, "Hizmet bulunamadı veya pasif durumda.");
    }

    // Saat gönderilmediyse mevcut saat korunur; süre değiştiyse bitiş yine de
    // yeniden hesaplanır (ör. yalnızca hizmet değişti, saat aynı kaldı).
    const baslangic = talep.startsAt === undefined ? mevcut.startsAt : new Date(talep.startsAt);
    if (baslangic.getTime() <= Date.now()) {
      throw new ApiError("VALIDATION_ERROR", 400, "Randevu geçmiş bir saate taşınamaz.");
    }
    const bitis = new Date(baslangic.getTime() + hizmet.durationMinutes * 60_000);

    const guncel = await prisma.appointment.update({
      where: { id },
      data: {
        serviceId: hizmet.id,
        startsAt: baslangic,
        endsAt: bitis,
        // Gönderilmeyen alan `undefined` kalır ve Prisma onu YAZMAZ.
        customerName: talep.customerName,
        customerPhone: talep.customerPhone,
      },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    const isletme = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { slug: true, timezone: true },
    });

    const dto = toAppointmentDto(guncel);

    // `whatsappUrl` OPSİYONELDİR: berber isterse müşteriye değişikliği bildirir.
    // Otomatik gönderim yoktur (spec satır 28-29, satır 84).
    return Response.json({
      appointment: dto,
      whatsappUrl: guncellemeWhatsappLinki(
        dto,
        isletme.timezone,
        randevuDetayUrl(isletme.slug, guncel.publicToken, request.nextUrl.origin),
      ),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
