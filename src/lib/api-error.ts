import { z } from "zod";

/**
 * API hata sözleşmesi.
 *
 * CLAUDE.md §2: sessizce yutulan catch bloğu YOK. Beklenen hatalar `ApiError`
 * olarak fırlatılır ve istemciye taşınır; beklenmeyen hatalar loglanır ve
 * istemciye yalnızca genel bir mesaj döner (iç detay sızdırılmaz).
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "TURNSTILE_FAILED"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SLOT_TAKEN"
  | "INVALID_STATE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** PostgreSQL exclusion_violation — Appointment_no_overlap_excl ihlali. */
const PG_EXCLUSION_VIOLATION = "23P01";

/**
 * Slot çakışmasını tespit eder.
 *
 * EXCLUDE kısıtı ihlali Postgres'te 23P01 döner. Unique ihlalinin (23505) aksine
 * bu kod Prisma'da P2002'ye EŞLENMEZ.
 *
 * Prisma 7 + @prisma/adapter-pg'de hata zinciri şudur (kaynak koddan doğrulandı):
 *   pg DatabaseError{code:"23P01"}
 *     -> adapter: DriverAdapterError{cause:{kind:"postgres", originalCode:"23P01"}}
 *     -> client: PrismaClientKnownRequestError{code:"P2039",
 *                meta:{driverAdapterError: <yukarıdaki>}}
 *
 * Yani DIŞ koda (`error.code`) bakmak YETMEZ — orada "P2039" vardır. Gerçek
 * Postgres kodu `meta.driverAdapterError.cause.originalCode` altındadır.
 * Bu yol sürüm yükseltmelerinde değişebileceği için son çare olarak hata
 * mesajındaki `23P01` metni de kontrol edilir (client bu kodu mesaja gömer).
 */
export function isSlotConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const aday = error as {
    code?: unknown;
    message?: unknown;
    meta?: { driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } };
    cause?: { code?: unknown; originalCode?: unknown };
  };

  const surucuHatasi = aday.meta?.driverAdapterError?.cause;
  if (
    surucuHatasi?.originalCode === PG_EXCLUSION_VIOLATION ||
    surucuHatasi?.code === PG_EXCLUSION_VIOLATION
  ) {
    return true;
  }

  // Adapter'ın kendi hatası doğrudan yakalanırsa (client sarmalamadan önce).
  if (
    aday.cause?.originalCode === PG_EXCLUSION_VIOLATION ||
    aday.cause?.code === PG_EXCLUSION_VIOLATION ||
    aday.code === PG_EXCLUSION_VIOLATION
  ) {
    return true;
  }

  return typeof aday.message === "string" && aday.message.includes(PG_EXCLUSION_VIOLATION);
}

/** PostgreSQL unique_violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Belirtilen ALANDA unique kısıt ihlali olup olmadığını söyler.
 *
 * `isSlotConflict` ile AYNI Prisma 7 tuzağı: dış `error.code` "P2002" olsa bile
 * ihlal edilen alanın adı ESKİ yerinde (`meta.target`) DEĞİLDİR. Canlı probe
 * çıktısı (2026-08-16, Prisma 7.9.1 + @prisma/adapter-pg):
 *
 *   code: "P2002"
 *   meta.target: undefined
 *   meta.driverAdapterError.cause: {
 *     originalCode: "23505", kind: "UniqueConstraintViolation",
 *     constraint: { fields: ["slug"] }
 *   }
 *
 * `meta.target` okuyan kod bu yüzden HER ZAMAN false döner ve çağıran taraftaki
 * "zaten kayıtlı" / "sonekli slug ile yeniden dene" dalları ölü koda dönüşür.
 *
 * Üç kaynak sırayla denenir: yeni adapter şekli, eski `meta.target` (sürüm
 * geri alınırsa çalışmaya devam etsin) ve son çare olarak hata metni.
 */
export function isUniqueViolation(error: unknown, alan: string): boolean {
  if (typeof error !== "object" || error === null) return false;

  const aday = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { originalCode?: unknown; constraint?: { fields?: unknown } };
      };
    };
  };

  const cause = aday.meta?.driverAdapterError?.cause;
  const alanlar = cause?.constraint?.fields;
  if (Array.isArray(alanlar) && alanlar.includes(alan)) return true;

  // Sürücü ihlali doğruladı ama alan adını vermediyse, alan bazlı karar veremeyiz.
  if (cause?.originalCode === PG_UNIQUE_VIOLATION && alanlar !== undefined) return false;

  const hedef = aday.meta?.target;
  if (Array.isArray(hedef) ? hedef.includes(alan) : hedef === alan) return true;

  // Son çare: Prisma alan adını mesaja gömer ("...failed on the fields: (`slug`)").
  return typeof aday.message === "string" && aday.message.includes(`\`${alan}\``);
}

/**
 * Route handler'lardaki catch bloklarının tek çıkışı.
 * Beklenmeyen hatalar loglanır — asla sessizce yutulmaz.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR" satisfies ApiErrorCode,
          message: "Gönderilen veri geçersiz.",
          details: z.treeifyError(error),
        },
      },
      { status: 400 },
    );
  }

  if (isSlotConflict(error)) {
    return Response.json(
      {
        error: {
          code: "SLOT_TAKEN" satisfies ApiErrorCode,
          message: "Bu saat az önce doldu. Lütfen başka bir saat seçin.",
        },
      },
      { status: 409 },
    );
  }

  console.error("[api] beklenmeyen hata:", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR" satisfies ApiErrorCode,
        message: "Beklenmeyen bir hata oluştu.",
      },
    },
    { status: 500 },
  );
}
