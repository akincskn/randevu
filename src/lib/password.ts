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
/**
 * Kayıtsız e-posta / şifresiz hesap durumunda karşılaştırılacak sahte hash.
 *
 * Erken `return false` YAPILMAZ: scrypt maliyeti (~45 ms) atlanırsa yanıt süresi
 * "hesap var" ile "hesap yok" arasında ölçülebilir bir fark yaratır ve bu uç bir
 * hesap numaralandırma (user enumeration) aracına dönüşür. Canlı ölçümde fark
 * 45 ms idi — tek istekle ayırt edilebilir düzeyde.
 *
 * Bu değer gerçek bir şifrenin hash'i değildir; hiçbir girdi ona eşleşmez.
 */
const SAHTE_HASH = `${ONEK}$${Buffer.alloc(TUZ_BAYT).toString("base64")}$${Buffer.alloc(
  HASH_BAYT,
).toString("base64")}`;

export async function sifreDogrula(sifre: string, saklanan: string | null): Promise<boolean> {
  // Geçersiz/eksik hash'te bile AYNI işi yap; sonucu sonra at.
  const parcalar = (saklanan ?? SAHTE_HASH).split("$");
  const gecerliBicim = parcalar.length === 3 && parcalar[0] === ONEK;
  const kullanilacak = gecerliBicim ? parcalar : SAHTE_HASH.split("$");

  try {
    const tuz = Buffer.from(kullanilacak[1], "base64");
    const beklenen = Buffer.from(kullanilacak[2], "base64");

    // Uzunluk uyuşmazlığında timingSafeEqual RangeError fırlatır; yine de scrypt
    // ÇALIŞTIRILDIKTAN sonra kontrol edilir ki maliyet her yolda aynı kalsın.
    const hesaplanan = await scryptAsync(sifre, tuz, HASH_BAYT);

    if (!saklanan || !gecerliBicim || beklenen.length !== HASH_BAYT) return false;

    return timingSafeEqual(hesaplanan, beklenen);
  } catch (error) {
    console.error("[password] hash doğrulanamadı:", error);
    return false;
  }
}
