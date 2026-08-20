"use client";

import { useSyncExternalStore } from "react";

/**
 * Periyodik olarak tazelenen "şu an" damgası.
 *
 * Randevunun geçmişte kalıp kalmadığına bakan her arayüz buna ihtiyaç duyar.
 * `Date.now()` render sırasında ÇAĞRILAMAZ (React Compiler saflık kuralı
 * `react-hooks/purity`) ve render anında bir kez okunan damga bir daha
 * güncellenmez — randevu biterken ekrandaki iptal butonu kendiliğinden
 * kaybolmazdı.
 *
 * Çözüm `useSyncExternalStore`: saat, React'ın dışındaki bir kaynak olarak
 * modellenir. `useState` + `useEffect` ikilisi burada YANLIŞ araçtı; efekt
 * gövdesinde `setState` çağırmak basamaklı render üretir (`set-state-in-effect`).
 *
 * Sunucuda ve hidrasyon sırasında `null` döner: sunucu saatiyle istemci saati
 * asla birebir aynı olmadığından herhangi bir sayı hidrasyon uyuşmazlığı
 * üretirdi. Çağıran taraf `null`'ı "henüz bilinmiyor" sayıp zamana bağlı
 * aksiyonu GÖSTERMEMELİDİR — yanlışlıkla gizlenen bir buton, geçmiş randevuya
 * basılan butondan ucuzdur.
 */

/** Tazeleme aralığı: dakika hassasiyetli randevu sınırları için 30 sn yeter. */
const ARALIK_MS = 30_000;

/** Tüm aboneler AYNI damgayı okur; `getSnapshot` her çağrıda değişirse React döngüye girer. */
let anlik = Date.now();
const dinleyiciler = new Set<() => void>();
let sayac: ReturnType<typeof setInterval> | null = null;

/** Sayaç yalnızca abone VARKEN çalışır — panel kapalıyken boşuna tik atmasın. */
function abone(bildir: () => void): () => void {
  dinleyiciler.add(bildir);

  if (sayac === null) {
    // İlk abonelikte damga tazelenir: modül yüklendiğinden beri saatler geçmiş olabilir.
    anlik = Date.now();
    sayac = setInterval(() => {
      anlik = Date.now();
      for (const dinleyici of dinleyiciler) dinleyici();
    }, ARALIK_MS);
  }

  return () => {
    dinleyiciler.delete(bildir);
    if (dinleyiciler.size === 0 && sayac !== null) {
      clearInterval(sayac);
      sayac = null;
    }
  };
}

const anlikAl = (): number | null => anlik;
const sunucudaAl = (): number | null => null;

export function useSuAn(): number | null {
  return useSyncExternalStore(abone, anlikAl, sunucudaAl);
}
