import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { type ExceptionDto, toExceptionDto } from "@/lib/dto-dashboard";
import { prisma } from "@/lib/prisma";
import { istisnaSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";
import { yerelAnHesapla } from "@/lib/timezone";

/**
 * Çalışma saati istisnaları — spec satır 19 ("tekil gün bazlı kapatma/özel saat").
 *
 * İstisna, haftalık kaydı EZER (bkz. `gunlukAralikCoz`): bayram/izin gününde
 * dükkan kapalıdır, o günün haftalık kaydı ne derse desin.
 */

/** GET /api/working-hours/exceptions — bugünden itibaren tanımlı istisnalar. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const isletme = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!isletme) {
      throw new ApiError("NOT_FOUND", 404, "İşletme bulunamadı.");
    }

    // Geçmiş istisnalar gizlenir: berbere bugünden sonrası lazım, geçen yılın
    // bayram kapanışı listeyi doldurmaktan başka bir işe yaramaz.
    const bugun = yerelAnHesapla(new Date(), isletme.timezone).isoGun;

    const istisnalar = await prisma.workingHoursException.findMany({
      where: { businessId, date: { gte: new Date(`${bugun}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    });

    return Response.json({ exceptions: istisnalar.map(toExceptionDto) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/working-hours/exceptions — istisna ekler veya aynı günün kaydını günceller.
 *
 * `upsert` kullanılır çünkü `@@unique([businessId, date])` var: aynı güne ikinci
 * kez istisna eklemek hata değil, o günü YENİDEN tanımlamaktır.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });
    const girdi = istisnaSemasi.parse(govde);

    // `@db.Date` alanı: UTC gece yarısı olarak yazılır, saat bileşeni taşımaz.
    const tarih = new Date(`${girdi.date}T00:00:00Z`);
    const saatler = {
      isClosed: girdi.isClosed,
      opensAtMinute: girdi.isClosed ? null : (girdi.opensAtMinute ?? null),
      closesAtMinute: girdi.isClosed ? null : (girdi.closesAtMinute ?? null),
    };

    const istisna = await prisma.workingHoursException.upsert({
      where: { businessId_date: { businessId, date: tarih } },
      create: { businessId, date: tarih, ...saatler },
      update: saatler,
    });

    const yanit: ExceptionDto = toExceptionDto(istisna);
    return Response.json(yanit, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
