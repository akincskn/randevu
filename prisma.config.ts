// Prisma 7 artık `.env` dosyasını KENDİLİĞİNDEN yüklemiyor; CLI komutlarının
// DIRECT_URL / DATABASE_URL değerlerini görebilmesi için burada açıkça yüklüyoruz.
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 yapılandırması.
 *
 * Prisma 7'de `datasource` bloğundaki `url` / `directUrl` alanları schema.prisma içinde
 * artık desteklenmiyor (P1012); bağlantı bilgisi bu dosyaya taşındı.
 *
 * `datasource.url` migration / introspection komutlarının kullandığı bağlantıdır ve Neon'da
 * bu MUTLAKA direct (pooled olmayan) bağlantı olmalıdır -> DIRECT_URL.
 * Uygulama çalışma zamanında kullanılan pooled bağlantı (DATABASE_URL) PrismaClient'a
 * driver adapter üzerinden verilir (src/lib/prisma.ts — bu aşamanın kapsamı dışında).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
