import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { toWorkingHoursDto, type WorkingHoursDto } from "@/lib/dto-dashboard";
import { prisma } from "@/lib/prisma";
import { haftalikSaatSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";

/**
 * Haftalık çalışma saatleri — spec satır 18 ("gün bazlı açık/kapalı + saat aralığı").
 *
 * Saatler gece yarısından itibaren DAKİKA ve YEREL duvar saatidir; mutlak zamana
 * çevrimi slot üreteci yapar (`src/lib/slots.ts`). "Dükkan 09:00'da açar" ifadesi
 * yaz saati kuralı değişse bile 09:00 kalmalıdır — bu yüzden burada tz taşınmaz.
 */

/** GET /api/working-hours — haftanın yedi günü, eksik gün varsa kapalı sayılır. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const kayitlar = await prisma.workingHours.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });

    const gunBazli = new Map(kayitlar.map((k) => [k.dayOfWeek, toWorkingHoursDto(k)]));

    // Kaydı olmayan gün KAPALI kabul edilir: `gunlukAralikCoz` da haftalık kayıt
    // yoksa null döndürüyor (bkz. availability.ts), iki taraf aynı varsayımda.
    const hafta: WorkingHoursDto[] = Array.from({ length: 7 }, (_, gun) => {
      return (
        gunBazli.get(gun) ?? {
          dayOfWeek: gun,
          isOpen: false,
          opensAtMinute: null,
          closesAtMinute: null,
        }
      );
    });

    return Response.json({ workingHours: hafta });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PUT /api/working-hours — haftanın TAMAMINI değiştirir.
 *
 * Kısmi güncelleme yerine tam hafta yazılır ve tek transaction'da yapılır:
 * yedi ayrı istek gönderilseydi, ortada kalan bir hata "salı güncellendi ama
 * çarşamba eski" gibi tutarsız bir haftaya yol açardı.
 */
export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });
    const hafta = haftalikSaatSemasi.parse(govde);

    await prisma.$transaction(
      hafta.map((gun) =>
        prisma.workingHours.upsert({
          where: { businessId_dayOfWeek: { businessId, dayOfWeek: gun.dayOfWeek } },
          // Kapalı günde saatler NULL'lanır: şema "isOpen=false ise
          // opensAtMinute/closesAtMinute null'dır" diyor, artık kalıntı değer bırakılmaz.
          create: {
            businessId,
            dayOfWeek: gun.dayOfWeek,
            isOpen: gun.isOpen,
            opensAtMinute: gun.isOpen ? gun.opensAtMinute : null,
            closesAtMinute: gun.isOpen ? gun.closesAtMinute : null,
          },
          update: {
            isOpen: gun.isOpen,
            opensAtMinute: gun.isOpen ? gun.opensAtMinute : null,
            closesAtMinute: gun.isOpen ? gun.closesAtMinute : null,
          },
        }),
      ),
    );

    const guncel = await prisma.workingHours.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });

    return Response.json({ workingHours: guncel.map(toWorkingHoursDto) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
