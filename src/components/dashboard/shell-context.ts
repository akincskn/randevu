"use client";

import { createContext, useContext } from "react";

/**
 * Panel kabuğunun paylaşılan durumu.
 *
 * Rozet sayacı KABUKTA durur, sayfalarda değil — spec satır 39 rozetin "her zaman
 * görünür" olmasını istiyor; sayfa başına ayrı sayaç tutulsaydı bir sayfada
 * güncellenip diğerinde bayat kalırdı.
 *
 * `rozetYenile`, bir aksiyon (onayla/iptal) bekleyen sayısını değiştirdiğinde
 * sayfaların kabuğa haber vermesini sağlar.
 */
export interface KabukDurumu {
  bekleyenSayisi: number;
  rozetYenile: () => void;
}

const KabukContext = createContext<KabukDurumu | null>(null);

export const KabukSaglayici = KabukContext.Provider;

export function useKabuk(): KabukDurumu {
  const durum = useContext(KabukContext);
  if (!durum) {
    // Sessizce varsayılan döndürmek yerine patlar: context'siz render, rozetin
    // sessizce güncellenmemesi demektir ve bu spec satır 39'u ihlal eder.
    throw new Error("useKabuk yalnızca DashboardShell içinde kullanılabilir.");
  }
  return durum;
}
