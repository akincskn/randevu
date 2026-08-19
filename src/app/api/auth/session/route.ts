import type { NextRequest } from "next/server";

import { toErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { oturumZorunlu, sessionSilHeader } from "@/lib/session";

/**
 * GET /api/auth/session — oturumdaki berberin kimliği (spec satır 67-68, UI katmanı).
 *
 * Dashboard sayfalarının açılış çağrısıdır: cookie `HttpOnly` olduğu için istemci
 * onu okuyamaz, "giriş yapmış mıyım?" sorusunu ancak sunucuya sorarak yanıtlayabilir.
 * 401 dönerse istemci `/login`'e yönlendirir.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const businessId = oturumZorunlu(request);

    const isletme = await prisma.business.findUnique({
      where: { id: businessId },
      // `timezone`: panelin yerel duvar saati <-> mutlak an çevirisi için gerekli
      // (manuel randevu formu, spec "Randevu akışı" madde 5). Gizli bir veri
      // değildir; public booking sayfası da aynı alanı görüyor (`dto.ts`).
      select: { slug: true, name: true, email: true, timezone: true },
    });

    // İmza geçerli ama işletme silinmiş: cookie'yi de temizle, aksi halde
    // istemci sonsuza kadar geçerli görünen bir oturumla 404 döngüsüne girer.
    if (!isletme) {
      return Response.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Oturumunuz artık geçerli değil. Lütfen tekrar giriş yapın.",
          },
        },
        { status: 401, headers: { "Set-Cookie": sessionSilHeader() } },
      );
    }

    return Response.json({ business: isletme });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/auth/session — çıkış.
 *
 * Oturum DURUMSUZ imzalı cookie olduğu için (bkz. `session.ts`) sunucuda silinecek
 * bir kayıt yoktur; tek yapılabilecek cookie'yi düşürmektir. Oturum zorunlu DEĞİL:
 * zaten çıkmış birinin tekrar "çıkış" demesi hata değil, istenen sonucun ta kendisidir.
 */
export async function DELETE(): Promise<Response> {
  try {
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionSilHeader() } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
