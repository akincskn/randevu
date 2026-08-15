"use client";

import { useEffect, useState } from "react";

import { musaitlikGetir, PublicApiError } from "@/lib/public-api";

/**
 * Seçili hizmet + gün için müsait saatleri getirir.
 *
 * TASARIM: `yukleniyor` bir state DEĞİL, TÜRETİLMİŞ bir değerdir. Effect içinde
 * `setYukleniyor(true)` çağırmak basamaklı render üretir (React'in
 * `set-state-in-effect` kuralı bunu hata sayar). Yerine her sonuç, hangi isteğe
 * ait olduğunu belirten bir ANAHTAR ile saklanır; saklanan anahtar güncel
 * anahtardan farklıysa yükleme sürüyor demektir.
 *
 * Bu yaklaşımın ikinci faydası yarış koşulunu kapatmasıdır: geç dönen eski bir
 * yanıt, anahtarı tutmadığı için asla güncel listenin üzerine yazamaz.
 */

interface Sonuc {
  anahtar: string;
  slotlar: string[];
  hata: string | null;
}

export interface MusaitlikDurumu {
  slotlar: string[];
  yukleniyor: boolean;
  hata: string | null;
  /** Girdiler aynı kalsa bile listeyi tazeler (ör. 409 SLOT_TAKEN sonrası). */
  yenile: () => void;
}

export function useAvailability(
  businessId: string | null,
  serviceId: string | null,
  isoGun: string | null,
): MusaitlikDurumu {
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [yenilemeSayaci, setYenilemeSayaci] = useState(0);

  const anahtar =
    businessId && serviceId && isoGun
      ? `${businessId}|${serviceId}|${isoGun}|${yenilemeSayaci}`
      : null;

  useEffect(() => {
    if (!anahtar || !businessId || !serviceId || !isoGun) return;

    let iptal = false;

    musaitlikGetir(businessId, serviceId, isoGun)
      .then((veri) => {
        if (!iptal) setSonuc({ anahtar, slotlar: veri.slots, hata: null });
      })
      .catch((hata: unknown) => {
        // CLAUDE.md §2: hata sessizce yutulmaz — loglanır ve kullanıcıya taşınır.
        console.error("[availability] müsaitlik alınamadı:", hata);
        if (iptal) return;
        setSonuc({
          anahtar,
          slotlar: [],
          hata: hata instanceof PublicApiError ? hata.message : "Müsait saatler alınamadı.",
        });
      });

    return () => {
      iptal = true;
    };
  }, [anahtar, businessId, serviceId, isoGun]);

  const guncel = sonuc !== null && sonuc.anahtar === anahtar ? sonuc : null;

  return {
    slotlar: guncel?.slotlar ?? [],
    yukleniyor: anahtar !== null && guncel === null,
    hata: guncel?.hata ?? null,
    yenile: () => setYenilemeSayaci((n) => n + 1),
  };
}
