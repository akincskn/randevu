"use client";

import { useMemo, useState } from "react";

import { useAvailability } from "@/components/public/use-availability";
import { isoGunEkle, REZERVASYON_UFKU_GUN } from "@/lib/slots";
import { mutlakAnHesapla, yerelAnHesapla } from "@/lib/timezone";

import type { ManuelRandevuAlanlari } from "./manual-appointment-fields";
import { useAktifHizmetler } from "./use-active-services";

/**
 * Randevu formlarının ORTAK durumu — ekleme (`manual-appointment-form.tsx`) ve
 * düzenleme (`appointment-edit-form.tsx`) tarafından paylaşılır.
 *
 * İki form da aynı seçicileri, aynı müsaitlik listesini ve aynı "seçilen saati
 * mutlak ana çevir" kuralını kullanmak ZORUNDA: ayrışırlarsa berber, ekleme
 * ekranında göremediği bir saati düzenleme ekranında seçebilir hale gelir
 * (kullanıcı kararı 2026-08-20'nin ihlali). Mantık burada TEK yerde durur.
 */

export interface RandevuFormuDurumu {
  hizmetler: ReturnType<typeof useAktifHizmetler>;
  /** İşletmenin bugününden itibaren rezervasyon ufku kadar gün. */
  gunler: string[];
  /** `serviceId` ve `slot` normalize edilmiş biçimde; doğrudan alanlara verilir. */
  degerler: ManuelRandevuAlanlari;
  musaitlik: ReturnType<typeof useAvailability>;
  degistir: <A extends keyof ManuelRandevuAlanlari>(
    alan: A,
    deger: ManuelRandevuAlanlari[A],
  ) => void;
  /** Gönderim sonrası alanları elle tazelemek için (ör. ekleme formunu boşaltmak). */
  yamala: (parca: Partial<ManuelRandevuAlanlari>) => void;
  /** Seçili saatin mutlak karşılığı; üretilemiyorsa sebebi. */
  baslangicHesapla: () => { an: Date } | { sorun: string };
}

export function useRandevuFormu({
  businessId,
  timezone,
  ilkDegerler,
  haricRandevuId,
}: {
  businessId: string;
  timezone: string;
  ilkDegerler: () => ManuelRandevuAlanlari;
  /** Düzenlemede: kendi saatini müsaitlik listesinden düşürmemesi gereken randevu. */
  haricRandevuId?: string;
}): RandevuFormuDurumu {
  const hizmetler = useAktifHizmetler();
  const [degerler, setDegerler] = useState<ManuelRandevuAlanlari>(ilkDegerler);

  const gunler = useMemo(() => {
    const bugun = yerelAnHesapla(new Date(), timezone).isoGun;
    return Array.from({ length: REZERVASYON_UFKU_GUN }, (_, i) => isoGunEkle(bugun, i));
  }, [timezone]);

  const serviceId = degerler.serviceId || hizmetler.liste?.[0]?.id || "";

  // Saat dışı modunda müsaitlik sorgusu ATILMAZ: liste zaten gösterilmiyor ve
  // her tarih değişiminde boşuna istek atmak public okuma kotasını yerdi.
  const musaitlik = useAvailability(
    degerler.saatDisiMod ? null : businessId,
    degerler.saatDisiMod ? null : serviceId || null,
    degerler.saatDisiMod ? null : degerler.gun,
    haricRandevuId,
  );

  // TÜRETİLMİŞ koruma, public akıştaki `booking-client.tsx` ile aynı: liste
  // tazelendiğinde (ör. 409 SLOT_TAKEN sonrası) artık var olmayan bir seçim
  // AYAKTA KALMAZ. Aksi halde berber hiçbir şey seçmeden tekrar gönderir ve
  // aynı dolu saat için ikinci kez 409 alırdı. Effect + setState yerine render'da
  // türetmek basamaklı render'ı da önler.
  const gecerliSlot =
    degerler.slot && musaitlik.slotlar.includes(degerler.slot) ? degerler.slot : null;

  function degistir<A extends keyof ManuelRandevuAlanlari>(
    alan: A,
    deger: ManuelRandevuAlanlari[A],
  ): void {
    setDegerler((onceki) => {
      const sonraki = { ...onceki, [alan]: deger };
      // Hizmet, gün veya mod değişince eski slot artık geçerli olmayabilir (slot
      // uzunluğu hizmete, liste güne bağlı). Seçimi taşımak sessizce yanlış saate
      // randevu yazdırırdı.
      if (alan === "serviceId" || alan === "gun" || alan === "saatDisiMod") {
        sonraki.slot = null;
      }
      return sonraki;
    });
  }

  function baslangicHesapla(): { an: Date } | { sorun: string } {
    if (!degerler.saatDisiMod) {
      if (!gecerliSlot) return { sorun: "Bir saat seçin." };
      return { an: new Date(gecerliSlot) };
    }

    const [saat, dakika] = degerler.serbestSaat.split(":").map(Number);
    if (!Number.isInteger(saat) || !Number.isInteger(dakika)) {
      return { sorun: "Randevu saatini girin." };
    }
    // Yaz saati geçişindeki BOŞLUK: o duvar saati o gün hiç yaşanmaz ve mutlak
    // bir ana çevrilemez. Sessizce yanlış saate yazmak yerine açıkça reddedilir.
    const an = mutlakAnHesapla(degerler.gun, saat * 60 + dakika, timezone);
    if (!an) {
      return { sorun: "Seçtiğiniz saat bu tarihte geçerli değil (saat değişimi)." };
    }
    return { an };
  }

  return {
    hizmetler,
    gunler,
    degerler: { ...degerler, serviceId, slot: gecerliSlot },
    musaitlik,
    degistir,
    yamala: (parca) => setDegerler((onceki) => ({ ...onceki, ...parca })),
    baslangicHesapla,
  };
}
