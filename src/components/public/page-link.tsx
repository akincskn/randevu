"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Randevu detay sayfasının kendi adresini görünür/seçilebilir metin olarak ve
 * bir "Kopyala" butonuyla gösterir.
 *
 * Müşterinin HESABI YOKTUR (spec satır 50); bu URL randevuya geri dönmesinin tek
 * yoludur. Bu yüzden adres altı durumun HEPSİNDE gösterilir — düşmüş bir randevuda
 * bile müşteri neye baktığını görebilmelidir. Duruma göre değişen tek şey üstteki
 * açıklama cümlesidir (bkz. `appointment-status.tsx` -> `linkAciklamasi`).
 *
 * Adres `useSyncExternalStore` ile okunur: `window` sunucuda yoktur, doğrudan render
 * sırasında okumak hydration uyuşmazlığı üretirdi. Sunucu anlık görüntüsü `null`,
 * istemci anlık görüntüsü gerçek adrestir — React ikisini kendisi eşitler, effect
 * içinde setState çağırmaya (ve zincirleme render'a) gerek kalmaz.
 */

type KopyaDurumu = "bos" | "kopyalandi" | "hata";

/** Adres sayfa ömrü boyunca değişmez; abonelik gerekmez, no-op çıkış döner. */
function adreseAbone(): () => void {
  return () => {};
}

/** `Object.is` string'leri değere göre karşılaştırdığı için her çağrıda yeni string üretmek güvenlidir. */
function adresAnlikGoruntusu(): string {
  // Sorgu parametreleri ve fragment kasten dışarıda: paylaşılan adres yalnızca
  // slug + token olmalı.
  return `${window.location.origin}${window.location.pathname}`;
}

/** Sunucuda `window` yok — ilk HTML'de adres kutusu hiç render edilmez. */
function sunucuAnlikGoruntusu(): null {
  return null;
}

const KOPYA_MESAJI: Record<Exclude<KopyaDurumu, "bos">, string> = {
  kopyalandi: "Adres panoya kopyalandı.",
  hata: "Kopyalanamadı — adresi elle seçip kopyalayabilirsiniz.",
};

export function SayfaLinki({ aciklama }: { aciklama: string }) {
  const adres = useSyncExternalStore(adreseAbone, adresAnlikGoruntusu, sunucuAnlikGoruntusu);
  const [kopyaDurumu, setKopyaDurumu] = useState<KopyaDurumu>("bos");

  // Geri bildirim kalıcı kalmasın; sekme kapanırsa zamanlayıcı temizlenir.
  useEffect(() => {
    if (kopyaDurumu === "bos") return;
    const zamanlayici = window.setTimeout(() => setKopyaDurumu("bos"), 4000);
    return () => window.clearTimeout(zamanlayici);
  }, [kopyaDurumu]);

  async function kopyala(): Promise<void> {
    if (!adres) return;
    try {
      // `navigator.clipboard` yalnızca güvenli bağlamda (https/localhost) tanımlıdır.
      if (!navigator.clipboard) throw new Error("Pano API'si bu tarayıcıda yok");
      await navigator.clipboard.writeText(adres);
      setKopyaDurumu("kopyalandi");
    } catch (sorun: unknown) {
      // Sessizce yutma yasak (CLAUDE.md §2): logla ve kullanıcıya görünür kıl.
      console.error("[randevu] sayfa adresi panoya kopyalanamadı", sorun);
      setKopyaDurumu("hata");
    }
  }

  if (!adres) return null;

  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <p className="text-sm">{aciklama}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 select-all break-all text-sm font-medium">{adres}</span>
        <button
          type="button"
          onClick={() => void kopyala()}
          className="min-h-11 shrink-0 rounded-xl border-2 border-neutral-300 px-4 text-sm font-semibold dark:border-neutral-700"
        >
          Kopyala
        </button>
      </div>
      {kopyaDurumu === "bos" ? null : (
        <p aria-live="polite" className="mt-2 text-sm opacity-70">
          {KOPYA_MESAJI[kopyaDurumu]}
        </p>
      )}
    </div>
  );
}
