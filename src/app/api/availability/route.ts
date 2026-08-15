import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { yerelAnHesapla } from "@/lib/timezone";
import type { AvailabilityDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { okumaKotasiTuket } from "@/lib/read-limit";
import { musaitlikSorgusuSemasi } from "@/lib/schemas";
import {
  isoGunEkle,
  isoGunHaftaninGunu,
  REZERVASYON_UFKU_GUN,
  slotlariUret,
} from "@/lib/slots";

/**
 * Slot'u BIRAKAN durumlar — `Appointment_no_overlap_excl` kısıtının WHERE
 * predicate'iyle BİREBİR aynı olmak zorunda. Ayrışırsa listede görünen bir saat
 * yazma anında 409 SLOT_TAKEN ile reddedilir (ya da tersi: dolu saat gizlenir).
 */
const SLOTU_BIRAKAN_DURUMLAR = ["CANCELLED", "EXPIRED"] as const;

/**
 * GET /api/availability?businessId=&serviceId=&date=YYYY-MM-DD
 *
 * Spec satır 22: müşteri "uygun saati görür". Bu route yalnızca LİSTELER;
 * randevunun gerçekten alınabilirliğine POST /api/appointments karar verir
 * (çalışma saati kontrolü orada tekrarlanır, çakışma ise veritabanındaki
 * EXCLUDE kısıtıyla — spec satır 43-44).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await okumaKotasiTuket(request, "availability");

    const sorgu = musaitlikSorgusuSemasi.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const isletme = await prisma.business.findUnique({
      where: { id: sorgu.businessId },
      select: { id: true, timezone: true },
    });
    if (!isletme) {
      throw new ApiError("NOT_FOUND", 404, "İşletme bulunamadı.");
    }

    // `isActive: true` şart: pasife alınmış hizmete slot üretilmez
    // (PROJECT_SPEC.md "Onaylanan Çıkarımlar", 2026-08-16). Pasif hizmet zaten
    // public listede görünmez; doğrudan id ile sorgulanırsa da yok sayılır.
    const hizmet = await prisma.service.findFirst({
      where: { id: sorgu.serviceId, businessId: isletme.id, isActive: true },
      select: { id: true, durationMinutes: true },
    });
    if (!hizmet) {
      throw new ApiError("NOT_FOUND", 404, "Hizmet bulunamadı.");
    }

    // Ufuk, İŞLETMENİN bugününe göre ölçülür: sunucu UTC'de, müşteri başka bir
    // saat diliminde olabilir; "bugün" tanımını belirleyen dükkandır.
    const bugun = yerelAnHesapla(new Date(), isletme.timezone).isoGun;
    const sonGun = isoGunEkle(bugun, REZERVASYON_UFKU_GUN - 1);
    if (sorgu.date < bugun || sorgu.date > sonGun) {
      throw new ApiError(
        "VALIDATION_ERROR",
        400,
        `Randevu yalnızca ${bugun} ile ${sonGun} arasındaki günler için alınabilir.`,
      );
    }

    const [haftalik, istisna] = await Promise.all([
      prisma.workingHours.findUnique({
        where: {
          businessId_dayOfWeek: {
            businessId: isletme.id,
            dayOfWeek: isoGunHaftaninGunu(sorgu.date),
          },
        },
      }),
      prisma.workingHoursException.findUnique({
        where: {
          businessId_date: {
            businessId: isletme.id,
            date: new Date(`${sorgu.date}T00:00:00Z`),
          },
        },
      }),
    ]);

    // Pencere bilerek GENİŞ (±1 gün): hangi saat diliminde olursak olalım o
    // takvim gününe değen tüm randevuları kapsar. Kesin çakışma kararını
    // `slotlariUret` verir; burada fazladan satır çekmenin maliyeti yok denecek kadar az.
    const gunBasi = Date.parse(`${sorgu.date}T00:00:00Z`);
    const doluAraliklar = await prisma.appointment.findMany({
      where: {
        businessId: isletme.id,
        status: { notIn: [...SLOTU_BIRAKAN_DURUMLAR] },
        startsAt: { lt: new Date(gunBasi + 2 * 86_400_000) },
        endsAt: { gt: new Date(gunBasi - 86_400_000) },
      },
      select: { startsAt: true, endsAt: true },
    });

    const slotlar = slotlariUret({
      isoGun: sorgu.date,
      timezone: isletme.timezone,
      hizmetSuresiDakika: hizmet.durationMinutes,
      haftalik,
      istisna,
      doluAraliklar: doluAraliklar.map((r) => ({ baslangic: r.startsAt, bitis: r.endsAt })),
      simdi: new Date(),
    });

    const yanit: AvailabilityDto = {
      date: sorgu.date,
      timezone: isletme.timezone,
      serviceId: hizmet.id,
      slots: slotlar.map((an) => an.toISOString()),
    };

    return Response.json(yanit);
  } catch (error) {
    return toErrorResponse(error);
  }
}
