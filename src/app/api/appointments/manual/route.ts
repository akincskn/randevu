import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { randevuDetayUrl } from "@/lib/appointment-links";
import { APPOINTMENT_DTO_INCLUDE, toAppointmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { manuelRandevuSemasi } from "@/lib/schemas-dashboard";
import { oturumZorunlu } from "@/lib/session";
import { publicTokenUret } from "@/lib/tokens";
import { onayWhatsappLinki } from "@/lib/whatsapp";

/**
 * POST /api/appointments/manual — berberin panelden ELLE eklediği randevu.
 *
 * Spec "Randevu akışı" madde 5 (2026-08-19 kapsam eklentisi). Public
 * `POST /api/appointments` ile arasındaki dört fark BİLİNÇLİDİR:
 *
 *   1. Turnstile YOK — istek oturum cookie'siyle korunuyor; bot doğrulaması
 *      giriş yapmış bir berber için anlamsızdır.
 *   2. Rate limit YOK — günlük telefon kotası (spec satır 74) müşteri kötüye
 *      kullanımına karşıdır. Berberin kendi defterine yazma hızını sınırlamak,
 *      yoğun bir günde kendi panelini kilitlemek olurdu.
 *   3. Durum doğrudan CONFIRMED — berber randevuyu telefonda/yüz yüze zaten
 *      onaylamıştır. PENDING yazmak, kendi kendini onaylamasını bekletmek ve
 *      rozeti (spec satır 68) sahte bir sayıyla şişirmek olurdu. Yan etki:
 *      CONFIRMED kayıt zaman aşımı süpürmesinin (yalnızca PENDING'e bakar)
 *      dışında kalır — istenen davranış budur.
 *   4. **ÇALIŞMA SAATİ / İSTİSNA KONTROLÜ BİLİNÇLİ OLARAK BYPASS EDİLİR** —
 *      berber kapalı günde veya kapanıştan sonra kendi takdiriyle müşteri
 *      alabilmelidir. Bu bir unutma veya tutarsızlık DEĞİLDİR; spec'te de
 *      "bilinçli bypass" olarak yazılıdır. Public akışta aynı kontrol
 *      (`randevuCalismaSaatiIcindeMi`) uygulanmaya DEVAM eder.
 *
 * DEĞİŞMEYENLER — bunlar bypass edilmez:
 *   - Slot çakışması `Appointment_no_overlap_excl` ile DB seviyesinde engellenir;
 *     çakışma 409 SLOT_TAKEN döner (CLAUDE.md §2, `toErrorResponse`).
 *   - Geçmiş saate randevu yazılamaz (kullanıcı kararı, 2026-08-19).
 *   - Yalnızca `isActive: true` hizmet seçilebilir (kullanıcı kararı, 2026-08-19).
 *   - `publicToken` kriptografik rastgele üretilir (spec satır 71).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const talep = manuelRandevuSemasi.parse(govde);

    const isletme = await prisma.business.findUnique({
      where: { id: businessId },
      select: { slug: true, timezone: true },
    });
    // İmza geçerli ama işletme silinmiş olabilir (bkz. /api/auth/session).
    if (!isletme) {
      throw new ApiError("UNAUTHORIZED", 401, "Oturumunuz artık geçerli değil.");
    }

    // `businessId` filtresi ŞART: aksi halde berber, id'sini bildiği başka bir
    // dükkanın hizmetini kendi randevusuna bağlayabilirdi.
    const hizmet = await prisma.service.findFirst({
      where: { id: talep.serviceId, businessId, isActive: true },
      select: { id: true, durationMinutes: true },
    });
    if (!hizmet) {
      throw new ApiError("NOT_FOUND", 404, "Hizmet bulunamadı veya pasif durumda.");
    }

    const baslangic = new Date(talep.startsAt);
    if (baslangic.getTime() <= Date.now()) {
      throw new ApiError("VALIDATION_ERROR", 400, "Geçmiş bir saate randevu eklenemez.");
    }
    const bitis = new Date(baslangic.getTime() + hizmet.durationMinutes * 60_000);

    // Çalışma saati kontrolü BURADA YOKTUR — yukarıdaki 4. maddenin karşılığı.
    // Slot çakışması kontrol EDİLMEZ; kararı EXCLUDE kısıtı yazma anında verir
    // (CLAUDE.md §2: "Race conditions are solved in the database, not the UI").
    const randevu = await prisma.appointment.create({
      data: {
        publicToken: publicTokenUret(),
        businessId,
        serviceId: hizmet.id,
        customerName: talep.customerName,
        customerPhone: talep.customerPhone,
        startsAt: baslangic,
        endsAt: bitis,
        status: "CONFIRMED",
      },
      include: APPOINTMENT_DTO_INCLUDE,
    });

    const dto = toAppointmentDto(randevu);

    // Push bildirimi GÖNDERİLMEZ: bildirimin alıcısı berberin kendisidir ve bu
    // randevuyu az önce o oluşturdu (spec satır 66 "yeni randevu TALEBİ" içindir).
    //
    // `whatsappUrl` yanıtta döner ama kullanımı OPSİYONELDİR — berber isterse
    // müşteriye onay mesajı gönderir. Onay akışıyla aynı üretici kullanılır
    // (spec satır 27-29: link üretilir, mesaj MANUEL gönderilir).
    return Response.json(
      {
        appointment: dto,
        whatsappUrl: onayWhatsappLinki(
          dto,
          isletme.timezone,
          randevuDetayUrl(isletme.slug, randevu.publicToken, request.nextUrl.origin),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
