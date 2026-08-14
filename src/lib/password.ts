import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  parola: string,
  tuz: Buffer,
  uzunluk: number,
) => Promise<Buffer>;

/**
 * Şifre hash'leme — `node:crypto` scrypt.
 *
 * Neden ek bağımlılık (bcrypt/argon2) yok: scrypt Node çekirdeğinde, bellek-zor
 * (memory-hard) bir KDF'tir ve GPU ile kaba kuvvet saldırısına bcrypt kadar
 * dirençlidir. Native derleme gerektiren bir paket eklemek Vercel free tier'da
 * gereksiz kırılganlık yaratır (CLAUDE.md §2 KISS).
 *
 * Depolama biçimi: `scrypt$<tuz_base64>$<hash_base64>`
 * Tuz her hash için ayrı üretilir; aynı şifreye sahip iki hesabın hash'i farklıdır.
 */
const TUZ_BAYT = 16;
const HASH_BAYT = 64;
const ONEK = "scrypt";

export async function sifreHashle(sifre: string): Promise<string> {
  const tuz = randomBytes(TUZ_BAYT);
  const hash = await scryptAsync(sifre, tuz, HASH_BAYT);
  return `${ONEK}$${tuz.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Şifreyi saklanan hash'e karşı doğrular.
 *
 * Karşılaştırma `timingSafeEqual` ile yapılır — düz `===` karşılaştırması,
 * eşleşen bayt sayısına göre süre farkı yaratıp zamanlama saldırısına açık kapı bırakır.
 * Biçimi bozuk veya null hash'te sessizce `false` döner, exception fırlatmaz:
 * çağıran taraf "şifre yanlış" ile "hash bozuk" arasında ayrım göremesin.
 */
export async function sifreDogrula(sifre: string, saklanan: string | null): Promise<boolean> {
  if (!saklanan) return false;

  const parcalar = saklanan.split("$");
  if (parcalar.length !== 3 || parcalar[0] !== ONEK) return false;

  try {
    const tuz = Buffer.from(parcalar[1], "base64");
    const beklenen = Buffer.from(parcalar[2], "base64");
    if (beklenen.length !== HASH_BAYT) return false;

    const hesaplanan = await scryptAsync(sifre, tuz, HASH_BAYT);
    return timingSafeEqual(hesaplanan, beklenen);
  } catch (error) {
    console.error("[password] hash doğrulanamadı:", error);
    return false;
  }
}
