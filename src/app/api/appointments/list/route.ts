import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import {
  APPOINTMENT_ADMIN_SELECT,
  type AppointmentListDto,
  toAppointmentAdminDto,
} from "@/lib/dto-dashboard";
import { prisma } from "@/lib/prisma";
import { randevuFiltreSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";
import { mutlakAnHesapla, yerelAnHesapla } from "@/lib/timezone";

/**
 * GET /api/appointments/list?scope=today|upcoming|pending|all
 *
 * Berber panelinin randevu kaynağı — spec satır 24 (bekleyen randevular) ve
 * satır 68 (her zaman görünür bekleyen sayısı rozeti).
 *
 * `list` alt yolu ZORUNLU: `/api/appointments` üzerinde zaten public POST var
 * (spec satır 22). Aynı dosyaya oturum gerektiren bir GET koymak, public ve
 * korumalı iki sözleşmeyi tek dosyada birleştirirdi.
 */
function gunSiniri(isoGun: string, timezone: string, gunEkle: number): Date {
  const damga = Date.parse(`${isoGun}T00:00:00Z`) + gunEkle * 86_400_000;
  const hedefGun = new Date(damga).toISOString().slice(0, 10);

  // Yaz saati geçişinde yerel gece yarısı YAŞANMAMIŞ olabilir; o durumda
  // `mutlakAnHesapla` null döner ve sınır bir sonraki dakikadan aranır.
  for (let dakika = 0; dakika < 24 * 60; dakika += 1) {
    const an = mutlakAnHesapla(hedefGun, dakika, timezone);
    if (an) return an;
  }
  throw new ApiError("INTERNAL_ERROR", 500, "Gün sınırı hesaplanamadı.");
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);
    const { scope } = randevuFiltreSemasi.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const isletme = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!isletme) {
      throw new ApiError("NOT_FOUND", 404, "İşletme bulunamadı.");
    }

    const bugun = yerelAnHesapla(new Date(), isletme.timezone).isoGun;

    // Filtreler İŞLETMENİN yerel gününe göre kurulur; sunucu UTC'de çalışsa da
    // "bugün" tanımını belirleyen dükkandır.
    const filtre: Prisma.AppointmentWhereInput = { businessId };
    if (scope === "today") {
      filtre.startsAt = {
        gte: gunSiniri(bugun, isletme.timezone, 0),
        lt: gunSiniri(bugun, isletme.timezone, 1),
      };
    } else if (scope === "upcoming") {
      filtre.startsAt = { gte: new Date() };
    } else if (scope === "pending") {
      filtre.status = "PENDING";
    }

    // Rozet sayacı filtreden BAĞIMSIZ: hangi sekmede olursak olalım toplam
    // bekleyen sayısını gösterir (spec satır 68 "her zaman görünür").
    const [appointments, pendingCount] = await Promise.all([
      prisma.appointment.findMany({
        where: filtre,
        select: APPOINTMENT_ADMIN_SELECT,
        orderBy: { startsAt: scope === "all" ? "desc" : "asc" },
        take: 200,
      }),
      prisma.appointment.count({ where: { businessId, status: "PENDING" } }),
    ]);

    const yanit: AppointmentListDto = {
      pendingCount,
      appointments: appointments.map(toAppointmentAdminDto),
      timezone: isletme.timezone,
    };

    return Response.json(yanit);
  } catch (error) {
    return toErrorResponse(error);
  }
}
