"use client";

import { createContext, useContext } from "react";

/**
 * Panel kabuğunun paylaşılan durumu.
 *
 * Rozet sayacı KABUKTA durur, sayfalarda değil — spec satır 68 rozetin "her zaman
 * görünür" olmasını istiyor; sayfa başına ayrı sayaç tutulsaydı bir sayfada
 * güncellenip diğerinde bayat kalırdı.
 *
 * `rozetYenile`, bir aksiyon (onayla/iptal) bekleyen sayısını değiştirdiğinde
 * sayfaların kabuğa haber vermesini sağlar.
 */
export interface KabukDurumu {
  bekleyenSayisi: number;
  rozetYenile: () => void;
  /**
   * İşletmenin IANA saat dilimi. Kabukta durur çünkü panelde girilen her saat
   * YEREL duvar saatidir ama API mutlak an bekler; çeviri (`mutlakAnHesapla`)
   * bu değer olmadan yapılamaz. Kabuk oturumu zaten çekiyor, sayfaların aynı
   * bilgi için ikinci bir istek atması gereksizdi.
   */
  timezone: string;
  /**
   * `Business.id` — manuel randevu formu `GET /api/availability`ı bu id ile
   * çağırıyor. `timezone` ile aynı gerekçeyle kabukta durur: oturum zaten
   * çekiliyor, sayfaların aynı bilgi için ikinci istek atması gereksizdi.
   */
  businessId: string;
}

const KabukContext = createContext<KabukDurumu | null>(null);

export const KabukSaglayici = KabukContext.Provider;

export function useKabuk(): KabukDurumu {
  const durum = useContext(KabukContext);
  if (!durum) {
    // Sessizce varsayılan döndürmek yerine patlar: context'siz render, rozetin
    // sessizce güncellenmemesi demektir ve bu spec satır 68'u ihlal eder.
    throw new Error("useKabuk yalnızca DashboardShell içinde kullanılabilir.");
  }
  return durum;
}
