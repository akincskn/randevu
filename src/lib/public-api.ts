import type { ApiErrorCode } from "./api-error";
import type {
  AppointmentDetailDto,
  AppointmentDto,
  AvailabilityDto,
  BusinessPublicDto,
} from "./dto";

/**
 * Public sayfaların API istemcisi.
 *
 * Sayfalar Prisma'ya DOĞRUDAN erişemez (STRUCTURE.md satır 59-60); tüm public veri
 * `api/` + DTO katmanından geçer. Bu modül o çağrıların TEK yeri — her bileşenin
 * kendi `fetch`'ini yazması hata mesajı ve timeout davranışını dağıtırdı.
 */

/** Sunucudan gelen hata gövdesinin taşıyıcısı — mesaj kullanıcıya gösterilir. */
export class PublicApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

/** CLAUDE.md §2: tüm dış çağrılarda timeout zorunlu. */
const ZAMAN_ASIMI_MS = 10_000;

function hataGovdesiCoz(ham: unknown): { code: ApiErrorCode; message: string } | null {
  if (typeof ham !== "object" || ham === null) return null;
  const hata = (ham as { error?: unknown }).error;
  if (typeof hata !== "object" || hata === null) return null;

  const { code, message } = hata as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;

  return { code: code as ApiErrorCode, message };
}

async function istek<T>(url: string, init?: RequestInit): Promise<T> {
  let yanit: Response;
  try {
    yanit = await fetch(url, { ...init, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  } catch (error) {
    // Ağ/timeout hatası sessizce yutulmaz (CLAUDE.md §2): loglanır ve
    // kullanıcıya anlaşılır bir mesaja çevrilir.
    console.error("[public-api] istek başarısız:", url, error);
    throw new PublicApiError(
      "NETWORK_ERROR",
      "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    );
  }

  const govde: unknown = await yanit.json().catch(() => null);

  if (!yanit.ok) {
    const cozulen = hataGovdesiCoz(govde);
    throw new PublicApiError(
      cozulen?.code ?? "INTERNAL_ERROR",
      cozulen?.message ?? "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    );
  }

  if (govde === null) {
    throw new PublicApiError("INTERNAL_ERROR", "Sunucudan geçersiz yanıt alındı.");
  }

  return govde as T;
}

export function isletmeGetir(slug: string): Promise<BusinessPublicDto> {
  return istek<BusinessPublicDto>(`/api/businesses/${encodeURIComponent(slug)}`);
}

export function musaitlikGetir(
  businessId: string,
  serviceId: string,
  date: string,
): Promise<AvailabilityDto> {
  const sorgu = new URLSearchParams({ businessId, serviceId, date });
  return istek<AvailabilityDto>(`/api/availability?${sorgu.toString()}`);
}

export function randevuGetir(token: string): Promise<AppointmentDetailDto> {
  return istek<AppointmentDetailDto>(`/api/appointments/token/${encodeURIComponent(token)}`);
}

export interface RandevuTalebiGovdesi {
  businessSlug: string;
  serviceId: string;
  customerName: string;
  customerPhone: string;
  startsAt: string;
  turnstileToken: string;
}

/** POST yanıtı `id` TAŞIMAZ (bkz. `toAppointmentDto`); yönlendirme `publicToken` ile yapılır. */
export function randevuOlustur(govde: RandevuTalebiGovdesi): Promise<AppointmentDto> {
  return istek<AppointmentDto>("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
}

export function randevuIptalEt(
  id: string,
  publicToken: string,
): Promise<AppointmentDetailDto> {
  return istek<AppointmentDetailDto>(`/api/appointments/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicToken }),
  });
}
