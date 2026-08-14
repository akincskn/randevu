import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { sifreDogrula } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { girisSemasi } from "@/lib/schemas";
import { sessionCookieHeader, sessionTokenUret } from "@/lib/session";

/**
 * POST /api/auth/login — berber girişi (spec satır 49).
 *
 * Faz 2 kapsamı API-only; giriş SAYFASI Faz 4'te (bkz. ROADMAP.md).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const giris = girisSemasi.parse(govde);

    const isletme = await prisma.business.findUnique({
      where: { email: giris.email },
      select: { id: true, slug: true, name: true, email: true, passwordHash: true },
    });

    const gecerli = await sifreDogrula(giris.password, isletme?.passwordHash ?? null);

    // Hesap yok ile şifre yanlış AYNI yanıtı döner: aksi halde bu uç, hangi
    // e-postaların kayıtlı olduğunu sızdıran bir hesap numaralandırma aracına dönüşür.
    // Süre farkı da kapatılır: sifreDogrula, hash null olsa bile sabit maliyetli
    // sahte bir hash'e karşı scrypt çalıştırır, erken dönmez (bkz. password.ts).
    if (!isletme || !gecerli) {
      throw new ApiError("UNAUTHORIZED", 401, "E-posta veya şifre hatalı.");
    }

    return Response.json(
      { business: { slug: isletme.slug, name: isletme.name, email: isletme.email } },
      { headers: { "Set-Cookie": sessionCookieHeader(sessionTokenUret(isletme.id)) } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
