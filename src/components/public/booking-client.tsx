"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { yerelAnHesapla } from "@/lib/timezone";
import type { BusinessPublicDto, ServicePublicDto } from "@/lib/dto";
import { gunBicimle, saatBicimle } from "@/lib/format";
import { isletmeGetir, PublicApiError, randevuOlustur } from "@/lib/public-api";
import { isoGunEkle, REZERVASYON_UFKU_GUN } from "@/lib/slots";

import { CustomerForm } from "./customer-form";
import { DatePicker } from "./date-picker";
import { ServicePicker } from "./service-picker";
import { SlotPicker } from "./slot-picker";
import { Bolum, HataKutusu, Yukleniyor } from "./ui";
import { useAvailability } from "./use-availability";

/**
 * Public randevu akışı — spec satır 22.
 *
 * Adım adım açılır: hizmet -> tarih -> saat -> ad+telefon. Her adım bir öncekini
 * gerektirir çünkü slot uzunluğu hizmete, müsaitlik ise güne bağlıdır.
 *
 * Veri Prisma'dan DEĞİL, `api/` + DTO katmanından gelir (STRUCTURE.md satır 78-79).
 */
export function BookingClient({ slug }: { slug: string }) {
  const router = useRouter();

  const [isletme, setIsletme] = useState<BusinessPublicDto | null>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);

  const [hizmet, setHizmet] = useState<ServicePublicDto | null>(null);
  const [gun, setGun] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const musaitlik = useAvailability(isletme?.id ?? null, hizmet?.id ?? null, gun);

  const [ad, setAd] = useState("");
  const [telefon, setTelefon] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [turnstileSifirlama, setTurnstileSifirlama] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderimHatasi, setGonderimHatasi] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    isletmeGetir(slug)
      .then((veri) => {
        if (iptal) return;
        setIsletme(veri);
        // Bugün, ZİYARETÇİNİN değil İŞLETMENİN takvimine göre belirlenir.
        setGun(yerelAnHesapla(new Date(), veri.timezone).isoGun);
      })
      .catch((hata: unknown) => {
        if (iptal) return;
        setYuklemeHatasi(
          hata instanceof PublicApiError ? hata.message : "İşletme bilgisi alınamadı.",
        );
      });
    return () => {
      iptal = true;
    };
  }, [slug]);

  const gunler = useMemo(() => {
    if (!gun) return [];
    const bugun = isletme ? yerelAnHesapla(new Date(), isletme.timezone).isoGun : gun;
    return Array.from({ length: REZERVASYON_UFKU_GUN }, (_, i) => isoGunEkle(bugun, i));
  }, [gun, isletme]);

  async function gonder(): Promise<void> {
    if (!isletme || !hizmet || !slot || !token) return;

    setGonderiliyor(true);
    setGonderimHatasi(null);
    try {
      const randevu = await randevuOlustur({
        businessSlug: isletme.slug,
        serviceId: hizmet.id,
        customerName: ad,
        customerPhone: telefon,
        startsAt: slot,
        turnstileToken: token,
      });
      router.push(`/${encodeURIComponent(isletme.slug)}/appointment/${randevu.publicToken}`);
    } catch (hata: unknown) {
      const mesaj =
        hata instanceof PublicApiError ? hata.message : "Randevu talebi gönderilemedi.";
      setGonderimHatasi(mesaj);

      // Turnstile token'ı TEK KULLANIMLIK: başarısız denemeden sonra yenisi alınmalı.
      setToken(null);
      setTurnstileSifirlama((n) => n + 1);

      // Saat başkası tarafından alındıysa liste bayattır — tazelenir.
      if (hata instanceof PublicApiError && hata.code === "SLOT_TAKEN") {
        setSlot(null);
        musaitlik.yenile();
      }
    } finally {
      setGonderiliyor(false);
    }
  }

  if (yuklemeHatasi) return <HataKutusu mesaj={yuklemeHatasi} />;
  if (!isletme) return <Yukleniyor metin="Yükleniyor…" />;

  return (
    <div className="space-y-7">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{isletme.name}</h1>
        {isletme.address ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{isletme.address}</p>
        ) : null}
      </header>

      <Bolum adim={1} baslik="Hizmet seçin">
        <ServicePicker
          hizmetler={isletme.services}
          seciliId={hizmet?.id ?? null}
          onSec={(secilen) => {
            setHizmet(secilen);
            // Saat seçimi hizmete bağlıdır (slot uzunluğu değişir) — sıfırlanır.
            setSlot(null);
          }}
        />
      </Bolum>

      {hizmet ? (
        <Bolum adim={2} baslik="Gün seçin">
          <DatePicker
            gunler={gunler}
            seciliGun={gun}
            onSec={(secilen) => {
              setGun(secilen);
              setSlot(null);
            }}
          />
        </Bolum>
      ) : null}

      {hizmet && gun ? (
        <Bolum adim={3} baslik={`Saat seçin — ${gunBicimle(gun)}`}>
          <SlotPicker
            slotlar={musaitlik.slotlar}
            timezone={isletme.timezone}
            seciliSlot={slot}
            yukleniyor={musaitlik.yukleniyor}
            hata={musaitlik.hata}
            onSec={setSlot}
          />
        </Bolum>
      ) : null}

      {/* `slotlar.includes` bilinçli bir TÜRETİLMİŞ koruma: liste tazelendiğinde
          (ör. 409 SLOT_TAKEN sonrası) artık var olmayan bir seçimle form açık
          kalmaz. Effect içinde setState ile sıfırlamak yerine render'da türetmek
          basamaklı render'ı da önler. */}
      {slot && musaitlik.slotlar.includes(slot) ? (
        <Bolum adim={4} baslik={`Bilgileriniz — ${saatBicimle(slot, isletme.timezone)}`}>
          <CustomerForm
            ad={ad}
            telefon={telefon}
            onAdChange={setAd}
            onTelefonChange={setTelefon}
            onTokenChange={setToken}
            turnstileSifirlama={turnstileSifirlama}
            tokenHazir={token !== null}
            gonderiliyor={gonderiliyor}
            hata={gonderimHatasi}
            onGonder={() => void gonder()}
          />
        </Bolum>
      ) : null}
    </div>
  );
}
