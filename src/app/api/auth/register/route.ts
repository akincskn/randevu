import type { NextRequest } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/api-error";
import { sifreHashle } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { kayitSemasi } from "@/lib/schemas";
import { sessionCookieHeader, sessionTokenUret } from "@/lib/session";
import { slugSonekEkle, slugTemelUret } from "@/lib/slug";

/** Prisma unique constraint ihlali. */
const PRISMA_UNIQUE_IHLALI = "P2002";

function benzersizIhlaliMi(error: unknown, alan: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const aday = error as { code?: unknown; meta?: { target?: unknown } };
  if (aday.code !== PRISMA_UNIQUE_IHLALI) return false;
  const hedef = aday.meta?.target;
  return Array.isArray(hedef) ? hedef.includes(alan) : hedef === alan;
}

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

    // Slug çakışması yarış koşuluna açık olduğu için önce-oku-sonra-yaz yapılmaz:
    // benzersizliğe DB karar verir, çakışırsa sonekli slug ile bir kez yeniden denenir.
    let isletme;
    try {
      isletme = await prisma.business.create({
        data: {
          slug: temelSlug,
          name: kayit.name,
          phone: kayit.phone,
          address: kayit.address,
          sector: kayit.sector,
          email: kayit.email,
          passwordHash,
        },
        select: { id: true, slug: true, name: true, email: true },
      });
    } catch (error) {
      if (benzersizIhlaliMi(error, "email")) {
        throw new ApiError("INVALID_STATE", 409, "Bu e-posta adresi zaten kayıtlı.");
      }
      if (!benzersizIhlaliMi(error, "slug")) throw error;

      isletme = await prisma.business.create({
        data: {
          slug: slugSonekEkle(temelSlug),
          name: kayit.name,
          phone: kayit.phone,
          address: kayit.address,
          sector: kayit.sector,
          email: kayit.email,
          passwordHash,
        },
        select: { id: true, slug: true, name: true, email: true },
      });
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
