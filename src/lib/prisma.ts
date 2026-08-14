import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { serverEnv } from "./env";

/**
 * PrismaClient tekil örneği (singleton).
 *
 * Prisma 7 BREAKING CHANGE: Rust query engine kaldırıldı, PostgreSQL bağlantısı
 * bir driver adapter üzerinden kurulur (`@prisma/adapter-pg`). Bağlantı URL'si
 * schema.prisma'dan değil, buradan verilir.
 *
 * Runtime'da POOLED bağlantı (DATABASE_URL) kullanılır — Neon'un pgbouncer'ı
 * serverless fonksiyonların bağlantı havuzunu tüketmesini engeller. Migration'lar
 * ise DIRECT_URL kullanır (bkz. prisma.config.ts); ikisi bilinçli olarak ayrıdır.
 *
 * `globalThis` üzerinde saklanır çünkü Next.js dev modunda hot reload her
 * derlemede modülü yeniden çalıştırır; aksi halde her reload yeni bir bağlantı
 * havuzu açar ve Neon bağlantı limiti dolar.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * TEMBEL (lazy) erişim — bağlantı ilk gerçek sorguda kurulur.
 *
 * Proxy şart: `export const prisma = createPrismaClient()` yazılsaydı modül import
 * edilir edilmez `serverEnv()` çalışır ve `next build` "collect page data" aşamasında
 * DATABASE_URL arardı. Build makinesinde secret bulunmayabilir; derlemenin çalışma
 * zamanı sırlarına bağlı olması yanlıştır. Proxy sayesinde import ücretsizdir.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_hedef, ozellik, alici) {
    return Reflect.get(getPrismaClient(), ozellik, alici);
  },
});
