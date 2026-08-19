import { after, type NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { yeniRandevuTalebiBildir } from "@/lib/push-notifications";
import { randevuCalismaSaatiIcindeMi } from "@/lib/availability";
import { yerelAnHesapla } from "@/lib/timezone";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import {
  gunlukTalepKotasiIadeEt,
  gunlukTalepKotasiTuket,
  kotaAsimiHatasi,
} from "@/lib/rate-limit";
import { randevuTalebiSemasi } from "@/lib/schemas";
import { publicTokenUret } from "@/lib/tokens";
import { turnstileDogrula } from "@/lib/turnstile";

/**
 * POST /api/appointments — public randevu talebi (spec satır 22-23).
 *
 * Sıralama bilinçli: en ucuz kontrol önce, en pahalı en sonda.
 *   1. Şema doğrulama (CPU, ~0)
 *   2. Turnstile (dış çağrı) — bot trafiği DB'ye hiç ulaşmasın
 *   3. Rate limit (Redis) — spec satır 74
 *   4. Çalışma saati kontrolü (DB okuma) — spec satır 73 "sadece UI kontrolü değil"
 *   5. Yazma — slot çakışması EXCLUDE kısıtıyla DB'de engellenir
 */
export async function POST(request: NextRequest): Promise<Response> {
  // Kota tüketildikten sonra randevu oluşturulamazsa hakkın iade edilebilmesi için
  // catch bloğundan da erişilebilir olmalı.
  let kotaTuketilenTelefon: string | null = null;

  try {
    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const talep = randevuTalebiSemasi.parse(govde);

    await turnstileDogrula(
      talep.turnstileToken,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    );

    const kota = await gunlukTalepKotasiTuket(talep.customerPhone);
    // İade YALNIZCA sayaç gerçekten arttıysa yapılabilir. Fail-open durumunda
    // artmadığı için iade edilirse sayaç negatife düşer ve limit bypass'ı doğar.
    if (kota.artirildiMi) {
      kotaTuketilenTelefon = talep.customerPhone;
    }
    if (!kota.izinVerildi) {
      throw kotaAsimiHatasi();
    }

    const isletme = await prisma.business.findUnique({
      where: { slug: talep.businessSlug },
      select: { id: true, timezone: true },
    });
    if (!isletme) {
      throw new ApiError("NOT_FOUND", 404, "İşletme bulunamadı.");
    }

    // `isActive: true` şart — savunmacı: istemci pasife alınmadan ÖNCE yüklenmiş
    // bir sayfadan eski serviceId'yi gönderebilir (PROJECT_SPEC.md "Onaylanan
    // Çıkarımlar", 2026-08-16). Listeden gizlemek tek başına yeterli değildir.
    const hizmet = await prisma.service.findFirst({
      where: { id: talep.serviceId, businessId: isletme.id, isActive: true },
      select: { id: true, durationMinutes: true },
    });
    if (!hizmet) {
      throw new ApiError("NOT_FOUND", 404, "Hizmet bulunamadı.");
    }

    const baslangic = new Date(talep.startsAt);
    if (baslangic.getTime() <= Date.now()) {
      throw new ApiError("VALIDATION_ERROR", 400, "Geçmiş bir saate randevu alınamaz.");
    }
    const bitis = new Date(baslangic.getTime() + hizmet.durationMinutes * 60_000);

    const yerel = yerelAnHesapla(baslangic, isletme.timezone);
    const [haftalik, istisna] = await Promise.all([
      prisma.workingHours.findUnique({
        where: {
          businessId_dayOfWeek: { businessId: isletme.id, dayOfWeek: yerel.haftaninGunu },
        },
      }),
      prisma.workingHoursException.findUnique({
        where: {
          businessId_date: { businessId: isletme.id, date: new Date(`${yerel.isoGun}T00:00:00Z`) },
        },
      }),
    ]);

    const uygunluk = randevuCalismaSaatiIcindeMi(
      baslangic,
      bitis,
      isletme.timezone,
      haftalik,
      istisna,
    );
    if (!uygunluk.uygun) {
      throw new ApiError("INVALID_STATE", 409, uygunluk.sebep);
    }

    // Slot çakışması burada KONTROL EDİLMEZ; Appointment_no_overlap_excl kısıtı
    // yazma anında karar verir. Önce-oku-sonra-yaz yaklaşımı yarış koşuluna açıktır
    // (spec satır 73: "Race conditions are solved in the database, not the UI").
    const randevu = await prisma.appointment.create({
      data: {
        publicToken: publicTokenUret(),
        businessId: isletme.id,
        serviceId: hizmet.id,
        customerName: talep.customerName,
        customerPhone: talep.customerPhone,
        startsAt: baslangic,
        endsAt: bitis,
      },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    // Randevu oluştu — hak gerçekten kullanıldı, iade edilmeyecek.
    kotaTuketilenTelefon = null;

    // Spec satır 66: berbere ANINDA push bildirimi.
    //
    // `after` ile YANIT GÖNDERİLDİKTEN SONRA çalışır: müşteri, berberin push
    // servisinin yavaşlığını beklemez. Çıplak fire-and-forget (await'siz promise)
    // serverless'ta yanlış olurdu — Vercel yanıttan sonra invocation'ı dondurur
    // ve gönderim yarıda kalırdı; `after` ömrü uzatır (next/server, v15.1+ stabil).
    //
    // `yeniRandevuTalebiBildir` fırlatmaz, ama `after` geri çağrısını yine de
    // korumaya alıyoruz: buradan kaçan bir hata randevunun kendisini etkilemez
    // (yanıt çoktan gitti) ama sunucu logunda yakalanmamış promise olarak görünür.
    after(async () => {
      try {
        const sonuc = await yeniRandevuTalebiBildir({
          businessId: isletme.id,
          timezone: isletme.timezone,
          customerName: randevu.customerName,
          startsAt: randevu.startsAt,
        });
        if (sonuc.basarisiz > 0) {
          console.error("[appointments] yeni randevu bildirimi kısmen başarısız:", sonuc);
        }
      } catch (error) {
        console.error("[appointments] yeni randevu bildirimi gönderilemedi:", error);
      }
    });

    return Response.json(toAppointmentDto(randevu), { status: 201 });
  } catch (error) {
    // Telafi edici iade: randevu OLUŞMADIYSA günlük hak yanmamalı. Slot dolu,
    // dükkan kapalı, geçmiş saat gibi retler müşterinin hatası değildir; 5 kez
    // dolu saate denemek günlük hakkı tüketmemeli.
    //
    // Rate limit'in KENDİ 429'u hariç tutulur: orada sayaç zaten limitin üstünde
    // ve iade, bir sonraki isteğin tekrar geçmesine yol açardı.
    const rateLimitReddi = error instanceof ApiError && error.code === "RATE_LIMITED";
    if (kotaTuketilenTelefon && !rateLimitReddi) {
      await gunlukTalepKotasiIadeEt(kotaTuketilenTelefon);
    }

    return toErrorResponse(error);
  }
}
