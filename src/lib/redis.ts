import { Redis } from "@upstash/redis";

import { serverEnv } from "./env";

/**
 * Upstash Redis istemcisi ve paylaşılan sayaç primitifi.
 *
 * Hem randevu kotası (`rate-limit.ts`, spec satır 64) hem public okuma limiti
 * (`read-limit.ts`, CLAUDE.md §2) buradan geçer — iki ayrı `Redis` örneği
 * açmak gereksiz bağlantı ve iki ayrı kopya Lua script'i demekti.
 */

/** CLAUDE.md §2: tüm dış çağrılarda timeout zorunlu. */
export const REDIS_ZAMAN_ASIMI_MS = 3_000;

/**
 * INCR + EXPIRE'ı TEK atomik adımda yapar.
 *
 * İki ayrı çağrı kullanılsaydı, `incr` başarılı olup `expire` düştüğünde anahtar
 * TTL'siz kalır ve o anahtar KALICI olarak engellenirdi. Lua script'i Redis'te
 * bölünmeden çalışır; ya ikisi de olur ya hiçbiri.
 *
 * `PEXPIRE ... NX` yerine TTL kontrolü elle yapılır: NX seçeneği eski Redis
 * sürümlerinde yoktur ve Upstash uyumluluğu garanti değildir.
 */
export const SAYAC_SCRIPT = `
  local sayac = redis.call('INCR', KEYS[1])
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return sayac
`;

let cachedRedis: Redis | null = null;

/** Tembel singleton — `serverEnv()` ancak ilk gerçek kullanımda doğrulanır. */
export function redis(): Redis {
  if (cachedRedis) return cachedRedis;
  const env = serverEnv();
  cachedRedis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cachedRedis;
}
