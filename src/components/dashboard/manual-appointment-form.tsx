"use client";

import { useMemo, useState } from "react";

import { useAvailability } from "@/components/public/use-availability";
import { DashboardApiError, manuelRandevuOlustur } from "@/lib/dashboard-api";
import { isoGunEkle, REZERVASYON_UFKU_GUN } from "@/lib/slots";
import { mutlakAnHesapla, yerelAnHesapla } from "@/lib/timezone";

import { AnaButon, Basari, Hata, IkincilButon, Yukleniyor } from "./form-ui";
import {
  ManualAppointmentFields,
  type ManuelRandevuAlanlari,
} from "./manual-appointment-fields";
import { useAktifHizmetler } from "./use-active-services";

/**
 * Berberin panelden ELLE randevu eklediği form — spec "Randevu akışı" madde 5.
 *
 * SAAT SEÇİMİ MÜŞTERİ AKIŞIYLA EŞDEĞERDİR (kullanıcı kararı, 2026-08-20):
 * varsayılan olarak `GET /api/availability`ın ürettiği slot ızgarası gösterilir —
 * müşterinin gördüğü listenin AYNISI, aynı hook ve aynı bileşenle. Dolu ve geçmiş
 * saatler zaten elenmiş geldiği için normal akışta çakışan bir saat seçilemez.
 *
 * Çalışma saati bypass'ı KALDIRILMADI, VARSAYILAN OLMAKTAN ÇIKARILDI: "çalışma
 * saati dışına randevu ekle" anahtarı açılınca serbest saat alanı belirir. Bayram
 * günü veya kapanış sonrası randevu hâlâ mümkün, ama artık kaza eseri değil
 * bilinçli bir seçimle.
 */
export function ManualAppointmentForm({
  businessId,
  timezone,
  onOlusturuldu,
}: {
  businessId: string;
  timezone: string;
  /** Randevu yazıldıktan sonra listenin ve rozetin tazelenmesi için. */
  onOlusturuldu: () => void;
}) {
  const hizmetler = useAktifHizmetler();

  const gunler = useMemo(() => {
    const bugun = yerelAnHesapla(new Date(), timezone).isoGun;
    return Array.from({ length: REZERVASYON_UFKU_GUN }, (_, i) => isoGunEkle(bugun, i));
  }, [timezone]);

  const [degerler, setDegerler] = useState<ManuelRandevuAlanlari>(() => ({
    serviceId: "",
    gun: yerelAnHesapla(new Date(), timezone).isoGun,
    slot: null,
    serbestSaat: "",
    saatDisiMod: false,
    ad: "",
    telefon: "",
  }));

  const serviceId = degerler.serviceId || hizmetler.liste?.[0]?.id || "";

  // Saat dışı modunda müsaitlik sorgusu ATILMAZ: liste zaten gösterilmiyor ve
  // her tarih değişiminde boşuna istek atmak public okuma kotasını yerdi.
  const musaitlik = useAvailability(
    degerler.saatDisiMod ? null : businessId,
    degerler.saatDisiMod ? null : serviceId || null,
    degerler.saatDisiMod ? null : degerler.gun,
  );

  // TÜRETİLMİŞ koruma, public akıştaki `booking-client.tsx` ile aynı: liste
  // tazelendiğinde (ör. 409 SLOT_TAKEN sonrası) artık var olmayan bir seçim
  // AYAKTA KALMAZ. Aksi halde berber hiçbir şey seçmeden tekrar gönderir ve
  // aynı dolu saat için ikinci kez 409 alırdı. Effect + setState yerine render'da
  // türetmek basamaklı render'ı da önler.
  const gecerliSlot =
    degerler.slot && musaitlik.slotlar.includes(degerler.slot) ? degerler.slot : null;

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

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
    setHata(null);
  }

  /** Gönderilecek mutlak anı üretir; üretilemiyorsa sebebini döndürür. */
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

  async function gonder(olay: React.FormEvent): Promise<void> {
    olay.preventDefault();
    setHata(null);
    setWhatsappUrl(null);

    const sonuc = baslangicHesapla();
    if ("sorun" in sonuc) {
      setHata(sonuc.sorun);
      return;
    }

    setGonderiliyor(true);
    try {
      const yanit = await manuelRandevuOlustur({
        serviceId,
        customerName: degerler.ad,
        customerPhone: degerler.telefon,
        startsAt: sonuc.an.toISOString(),
      });
      // WhatsApp mesajı OPSİYONELDİR: link gösterilir, gönderme kararı berberindir.
      setWhatsappUrl(yanit.whatsappUrl);
      setDegerler((onceki) => ({ ...onceki, ad: "", telefon: "", serbestSaat: "", slot: null }));
      onOlusturuldu();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Randevu eklenemedi.");
    } finally {
      // Başarıda da retde de liste tazelenir: yeni kayıt slotu kapatmış olabilir
      // (409 SLOT_TAKEN durumunda ise başka bir randevu kapatmıştır). Bayat liste
      // dolu bir saati tekrar seçtirirdi.
      musaitlik.yenile();
      setGonderiliyor(false);
    }
  }

  if (hizmetler.liste === null) {
    return <Yukleniyor metin="Hizmetler yükleniyor…" />;
  }

  if (hizmetler.hata) {
    return <Hata mesaj={hizmetler.hata} />;
  }

  if (hizmetler.liste.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-200 px-4 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        Önce en az bir aktif hizmet tanımlamalısınız.
      </p>
    );
  }

  return (
    <form
      onSubmit={(olay) => void gonder(olay)}
      className="space-y-3 rounded-xl border-2 border-neutral-200 p-4 dark:border-neutral-800"
    >
      {hata ? <Hata mesaj={hata} /> : null}

      {whatsappUrl ? (
        <div className="space-y-2">
          <Basari mesaj="Randevu eklendi ve onaylandı olarak kaydedildi." />
          <IkincilButon onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}>
            WhatsApp&apos;tan onay gönder
          </IkincilButon>
        </div>
      ) : null}

      <ManualAppointmentFields
        hizmetler={hizmetler.liste}
        gunler={gunler}
        timezone={timezone}
        musaitlik={musaitlik}
        degerler={{ ...degerler, serviceId, slot: gecerliSlot }}
        degistir={degistir}
      />

      <AnaButon disabled={gonderiliyor}>
        {gonderiliyor ? "Ekleniyor…" : "Randevuyu ekle"}
      </AnaButon>
    </form>
  );
}
