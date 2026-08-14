import { z } from "zod";

/**
 * Ortam değişkenlerinin TEK doğrulama noktası.
 *
 * CLAUDE.md §2: "no `any`" ve "explicit error handling" — eksik/bozuk bir ortam
 * değişkeni sessizce `undefined` olarak akmaz, modül yüklenirken patlar. Bu,
 * hatayı ilk isteğin ortasında değil, süreç ayağa kalkarken görmemizi sağlar.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL tanımlı değil (Neon pooled bağlantı)"),

  UPSTASH_REDIS_REST_URL: z.url("UPSTASH_REDIS_REST_URL geçerli bir URL olmalı"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN tanımlı değil"),

  TURNSTILE_SECRET_KEY: z.string().min(1, "TURNSTILE_SECRET_KEY tanımlı değil"),

  // Session cookie'sini imzalar. Sızarsa herkes kendine geçerli oturum üretebilir.
  // En az 32 karakter: `openssl rand -base64 32` veya `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET en az 32 karakter olmalı (kriptografik rastgele bir değer)"),
});

let cached: z.infer<typeof serverEnvSchema> | null = null;

/**
 * Sunucu tarafı ortam değişkenlerini doğrulanmış olarak döndürür.
 *
 * Lazy: `next build` sırasında modül import edilse bile, gerçekten bir istek
 * işlenene kadar doğrulama çalışmaz. Böylece build ortamında Upstash/Turnstile
 * anahtarları bulunmasa da derleme başarısız olmaz.
 */
export function serverEnv(): z.infer<typeof serverEnvSchema> {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const eksikler = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Ortam değişkeni yapılandırması geçersiz:\n${eksikler}`);
  }

  cached = parsed.data;
  return cached;
}
