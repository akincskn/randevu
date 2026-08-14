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
 * bu kod Prisma'da P2002'ye EŞLENMEZ — ham hata koduna bakmak zorundayız.
 * Hata nesnesinin şekli adapter katmanına göre değiştiği için birkaç olası
 * konumun tamamı denenir.
 */
export function isSlotConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const aday = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: { code?: unknown };
  };

  return (
    aday.code === PG_EXCLUSION_VIOLATION ||
    aday.meta?.code === PG_EXCLUSION_VIOLATION ||
    aday.cause?.code === PG_EXCLUSION_VIOLATION
  );
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
