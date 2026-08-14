import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { serverEnv } from "./env";

/**
 * Berber oturumu — spec satır 48-49 ("basit email/şifre", SMS OTP YOK).
 *
 * Durumsuz (stateless) imzalı cookie: `<businessId>.<sonKullanma>.<hmac>`.
 * Veritabanında Session tablosu YOK — eklemek yeni bir migration gerektirirdi ve
 * bu fazın kapsamı API-only minimal auth (bkz. ROADMAP.md Faz 2).
 *
 * BİLİNEN SINIR: durumsuz oturum tek tek İPTAL EDİLEMEZ. "Tüm cihazlardan çıkış"
 * ancak SESSION_SECRET döndürülerek (tüm oturumları düşürerek) yapılabilir.
 * Kalıcı iptal gerekirse Faz 4'te Session tablosu eklenmelidir.
 */
export const SESSION_COOKIE = "randevu_session";

/** 30 gün — esnaf her gün girip çıkmak zorunda kalmasın. */
const OMUR_MS = 30 * 24 * 60 * 60 * 1000;

function imzala(govde: string): string {
  return createHmac("sha256", serverEnv().SESSION_SECRET).update(govde).digest("base64url");
}

export function sessionTokenUret(businessId: string): string {
  const sonKullanma = Date.now() + OMUR_MS;
  const govde = `${businessId}.${sonKullanma}`;
  return `${govde}.${imzala(govde)}`;
}

/** Token geçerliyse businessId, değilse null. Asla exception fırlatmaz. */
export function sessionTokenCoz(token: string | undefined): string | null {
  if (!token) return null;

  const parcalar = token.split(".");
  if (parcalar.length !== 3) return null;

  const [businessId, sonKullanmaHam, imza] = parcalar;
  const beklenen = imzala(`${businessId}.${sonKullanmaHam}`);

  // Zamanlama saldırısına karşı sabit süreli karşılaştırma.
  const a = Buffer.from(imza);
  const b = Buffer.from(beklenen);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const sonKullanma = Number(sonKullanmaHam);
  if (!Number.isFinite(sonKullanma) || sonKullanma <= Date.now()) return null;

  return businessId;
}

/**
 * `Set-Cookie` başlığını üretir.
 *
 * - `HttpOnly`: JS'ten okunamaz, XSS ile oturum çalınmasını zorlaştırır
 * - `SameSite=Lax`: CSRF koruması, normal gezinmeyi bozmaz
 * - `Secure`: yalnızca production (localhost http üzerinden çalışır)
 */
export function sessionCookieHeader(token: string): string {
  const parcalar = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${Math.floor(OMUR_MS / 1000)}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") {
    parcalar.push("Secure");
  }
  return parcalar.join("; ");
}

/** Oturumu sonlandırır (çıkış). */
export function sessionSilHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

/**
 * İsteği yapan berberin businessId'sini döndürür.
 * Oturum yoksa/geçersizse `ApiError(NOT_FOUND-değil, 401)` fırlatır.
 */
export function oturumZorunlu(request: NextRequest): string {
  const businessId = sessionTokenCoz(request.cookies.get(SESSION_COOKIE)?.value);
  if (!businessId) {
    throw new ApiError("UNAUTHORIZED", 401, "Bu işlem için giriş yapmanız gerekiyor.");
  }
  return businessId;
}
