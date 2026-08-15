import type { NextRequest } from "next/server";

import { ApiError, isUniqueViolation, toErrorResponse } from "@/lib/api-error";
import { sifreHashle } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { kayitSemasi } from "@/lib/schemas";
import { sessionCookieHeader, sessionTokenUret } from "@/lib/session";
import { slugSonekEkle, slugTemelUret } from "@/lib/slug";

/**
 * POST /api/auth/register — berber hesabı + Business kaydı (spec satır 15-16, 49).
 *
 * Faz 2 kapsamı API-only; kayıt SAYFASI Faz 4'te (bkz. ROADMAP.md).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const govde = await request.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", 400, "İstek gövdesi geçerli JSON değil.");
    });

    const kayit = kayitSemasi.parse(govde);
    const passwordHash = await sifreHashle(kayit.password);
    const temelSlug = slugTemelUret(kayit.name);

    const ortakAlanlar = {
      name: kayit.name,
      phone: kayit.phone,
      address: kayit.address,
      sector: kayit.sector,
      email: kayit.email,
      passwordHash,
    };

    /**
     * Tek bir kayıt denemesi.
     *
     * E-posta ihlali HER denemede 409'a çevrilir. Yalnızca ilk denemede
     * çevrilseydi şu senaryo 500 verirdi (canlı olarak gözlendi): aynı İSİM +
     * aynı E-POSTA ile kayıt olunduğunda önce SLUG çakışır, sonekli slug ile
     * yeniden denenir ve bu ikinci denemedeki e-posta ihlali dışarı kaçardı.
     */
    const kayitDene = async (slug: string) => {
      try {
        return await prisma.business.create({
          data: { slug, ...ortakAlanlar },
          select: { id: true, slug: true, name: true, email: true },
        });
      } catch (error) {
        if (isUniqueViolation(error, "email")) {
          throw new ApiError("INVALID_STATE", 409, "Bu e-posta adresi zaten kayıtlı.");
        }
        throw error;
      }
    };

    // Slug çakışması yarış koşuluna açık olduğu için önce-oku-sonra-yaz yapılmaz:
    // benzersizliğe DB karar verir, çakışırsa sonekli slug ile bir kez yeniden denenir.
    let isletme;
    try {
      isletme = await kayitDene(temelSlug);
    } catch (error) {
      if (!isUniqueViolation(error, "slug")) throw error;
      isletme = await kayitDene(slugSonekEkle(temelSlug));
    }

    return Response.json(
      { business: { slug: isletme.slug, name: isletme.name, email: isletme.email } },
      {
        status: 201,
        headers: { "Set-Cookie": sessionCookieHeader(sessionTokenUret(isletme.id)) },
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
