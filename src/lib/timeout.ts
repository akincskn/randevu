/**
 * Dış çağrılar için ortak zaman aşımı sarmalayıcısı.
 *
 * CLAUDE.md §2: "timeouts on all external calls". Turnstile `AbortSignal.timeout`
 * kullanabiliyor çünkü `fetch` iptal edilebilir; Upstash SDK ve Prisma sorguları
 * ise iptal sinyali kabul etmez, o yüzden yarıştırma (race) gerekir.
 *
 * ÖNEMLİ SINIR: `race` yalnızca BEKLEMEYİ kısaltır, alttaki işi İPTAL ETMEZ.
 * Zaman aşımına uğrayan bir Redis/Prisma çağrısı arka planda tamamlanabilir.
 * Bu yüzden `withTimeout` yan etkisi olan işlemlerde tek başına yeterli değildir;
 * çağıran taraf telafi (compensation) mantığını da düşünmelidir.
 */
export class TimeoutError extends Error {
  constructor(readonly etiket: string, readonly ms: number) {
    super(`${etiket} ${ms}ms içinde yanıt vermedi.`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  is: Promise<T>,
  ms: number,
  etiket: string,
): Promise<T> {
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;

  const zamanAsimi = new Promise<never>((_, reddet) => {
    zamanlayici = setTimeout(() => reddet(new TimeoutError(etiket, ms)), ms);
  });

  try {
    return await Promise.race([is, zamanAsimi]);
  } finally {
    // Zamanlayıcı temizlenmezse Node süreci boşuna açık kalır.
    if (zamanlayici) clearTimeout(zamanlayici);
  }
}
