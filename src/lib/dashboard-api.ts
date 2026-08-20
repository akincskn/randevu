import type { ApiErrorCode } from "./api-error";
import type { ExceptionDto, ServiceAdminDto, WorkingHoursDto } from "./dto-dashboard";

/**
 * Dashboard'un API istemcisi — `public-api.ts`'in berber tarafındaki eşi.
 *
 * AYRI tutuluyor çünkü iki katmanın hata sözleşmesi farklıdır: public tarafta 401
 * beklenmeyen bir durumdur, burada ise NORMAL akışın parçasıdır (oturum düşmüş,
 * `/login`'e gidilecek). `PublicApiError` ile karıştırmamak için ayrı bir sınıf.
 *
 * Randevu uç noktaları `dashboard-api-appointments.ts`'e AYRILDI (200 satır
 * sınırı, CLAUDE.md §2); taşıma katmanı (`dashboardIstek`/`dashboardYaz`) ve
 * `DashboardApiError` burada kalır, orası bunları içe aktarır.
 */

export class DashboardApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }

  /** Oturum düştü mü — çağıranın `/login`'e yönlendirmesi gereken durum. */
  get oturumDustu(): boolean {
    return this.code === "UNAUTHORIZED";
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

export async function dashboardIstek<T>(url: string, init?: RequestInit): Promise<T> {
  let yanit: Response;
  try {
    yanit = await fetch(url, { ...init, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  } catch (error) {
    console.error("[dashboard-api] istek başarısız:", url, error);
    throw new DashboardApiError(
      "NETWORK_ERROR",
      "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    );
  }

  const govde: unknown = await yanit.json().catch(() => null);

  if (!yanit.ok) {
    const cozulen = hataGovdesiCoz(govde);
    throw new DashboardApiError(
      cozulen?.code ?? "INTERNAL_ERROR",
      cozulen?.message ?? "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    );
  }

  if (govde === null) {
    throw new DashboardApiError("INTERNAL_ERROR", "Sunucudan geçersiz yanıt alındı.");
  }

  return govde as T;
}

/** JSON gövdeli yazma istekleri için kısa yol. */
export function dashboardYaz<T>(url: string, method: string, govde?: unknown): Promise<T> {
  return dashboardIstek<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });
}

export interface OturumBilgisi {
  business: { id: string; slug: string; name: string; email: string; timezone: string };
}

export const oturumGetir = (): Promise<OturumBilgisi> =>
  dashboardIstek<OturumBilgisi>("/api/auth/session");

export const cikisYap = (): Promise<{ ok: boolean }> =>
  dashboardYaz<{ ok: boolean }>("/api/auth/session", "DELETE");

/** Tarayıcının ürettiği push aboneliğini sunucuya kaydeder (spec satır 65-67). */
export interface PushAbonelikGirdisi {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushAbonelikKaydet = (
  girdi: PushAbonelikGirdisi,
): Promise<{ endpoint: string; createdAt: string }> =>
  dashboardYaz<{ endpoint: string; createdAt: string }>("/api/push/subscribe", "POST", girdi);

export const hizmetleriGetir = (): Promise<{ services: ServiceAdminDto[] }> =>
  dashboardIstek<{ services: ServiceAdminDto[] }>("/api/services");

export interface HizmetGirdisi {
  name: string;
  durationMinutes: number;
  price: string | null;
  isActive?: boolean;
}

export const hizmetOlustur = (girdi: HizmetGirdisi): Promise<ServiceAdminDto> =>
  dashboardYaz<ServiceAdminDto>("/api/services", "POST", girdi);

export const hizmetGuncelle = (
  id: string,
  girdi: Partial<HizmetGirdisi>,
): Promise<ServiceAdminDto> =>
  dashboardYaz<ServiceAdminDto>(`/api/services/${encodeURIComponent(id)}`, "PATCH", girdi);

export const hizmetSil = (id: string): Promise<{ ok: boolean }> =>
  dashboardYaz<{ ok: boolean }>(`/api/services/${encodeURIComponent(id)}`, "DELETE");

export const calismaSaatleriGetir = (): Promise<{ workingHours: WorkingHoursDto[] }> =>
  dashboardIstek<{ workingHours: WorkingHoursDto[] }>("/api/working-hours");

export const calismaSaatleriKaydet = (
  hafta: WorkingHoursDto[],
): Promise<{ workingHours: WorkingHoursDto[] }> =>
  dashboardYaz<{ workingHours: WorkingHoursDto[] }>("/api/working-hours", "PUT", hafta);

export const istisnalariGetir = (): Promise<{ exceptions: ExceptionDto[] }> =>
  dashboardIstek<{ exceptions: ExceptionDto[] }>("/api/working-hours/exceptions");

export interface IstisnaGirdisi {
  date: string;
  isClosed: boolean;
  opensAtMinute?: number | null;
  closesAtMinute?: number | null;
}

export const istisnaKaydet = (girdi: IstisnaGirdisi): Promise<ExceptionDto> =>
  dashboardYaz<ExceptionDto>("/api/working-hours/exceptions", "POST", girdi);

export const istisnaSil = (id: string): Promise<{ ok: boolean }> =>
  dashboardYaz<{ ok: boolean }>(
    `/api/working-hours/exceptions/${encodeURIComponent(id)}`,
    "DELETE",
  );
