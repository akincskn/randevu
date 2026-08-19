"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardApiError, pushAbonelikKaydet } from "@/lib/dashboard-api";

/**
 * "Bildirimleri Aç" — spec satır 55-57 (Web Push, VAPID, Firebase YOK).
 *
 * Panel kabuğunda durur, yani DÖRT SEKMEDE DE görünür (kullanıcı kararı,
 * 2026-08-16). Abonelik zaten varsa buton yerine "Bildirimler açık" yazar.
 *
 * VAPID PUBLIC anahtarı prop olarak gelir: sunucu bileşeni olan
 * `dashboard/layout.tsx` `process.env`'den okur. Böylece ne `NEXT_PUBLIC_`
 * değişkeni ne de anahtarı dağıtan yeni bir API route'u gerekir.
 */

type Durum = "kontrol" | "desteklenmiyor" | "kapali" | "acik" | "engellendi";

/**
 * VAPID anahtarı base64url metindir; `applicationServerKey` ham bayt ister.
 *
 * Dönüş tipi `Uint8Array<ArrayBuffer>` olarak DARALTILDI: `applicationServerKey`
 * `BufferSource` bekler ve genel `Uint8Array<ArrayBufferLike>` (SharedArrayBuffer
 * de olabilir) bu tipe atanamaz. Bu yüzden tampon açıkça `ArrayBuffer` üretilir.
 */
function base64UrlBaytaCevir(base64Url: string): Uint8Array<ArrayBuffer> {
  const dolgu = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + dolgu).replace(/-/g, "+").replace(/_/g, "/");
  const ham = atob(base64);
  const baytlar = new Uint8Array(new ArrayBuffer(ham.length));
  for (let i = 0; i < ham.length; i += 1) {
    baytlar[i] = ham.charCodeAt(i);
  }
  return baytlar;
}

function destekVarMi(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Tarayıcı aboneliğini sunucuya yazar; anahtarlar eksikse hata fırlatır. */
async function aboneligiSunucuyaYaz(abonelik: PushSubscription): Promise<void> {
  const json = abonelik.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) {
    throw new Error("Tarayıcı abonelik anahtarlarını vermedi.");
  }
  await pushAbonelikKaydet({ endpoint: abonelik.endpoint, keys: { p256dh, auth } });
}

/**
 * Açılıştaki mevcut durumu ölçer.
 *
 * Bileşenin DIŞINDA ve tamamen asenkron: `react-hooks/set-state-in-effect`
 * kuralı effect gövdesinde SENKRON setState çağrılmasını yasaklar, bu yüzden
 * ölçüm bir Promise döndürür ve durum yalnızca sonucunda yazılır.
 */
async function durumOlc(): Promise<Durum> {
  if (!destekVarMi()) return "desteklenmiyor";
  if (Notification.permission === "denied") return "engellendi";

  const kayit = await navigator.serviceWorker.getRegistration();
  const abonelik = kayit ? await kayit.pushManager.getSubscription() : null;
  if (!abonelik) return "kapali";

  // Abonelik VARSA sunucuya tekrar yazılır: tarayıcı aboneliği sessizce
  // yenileyebilir (endpoint değişir) ve o durumda veritabanındaki kayıt ölür.
  // Yazma başarısız olsa da tarayıcı tarafı AÇIKTIR — durum bozulmaz, loglanır.
  try {
    await aboneligiSunucuyaYaz(abonelik);
  } catch (sorun: unknown) {
    console.error("[push-ui] mevcut abonelik sunucuya yazılamadı:", sorun);
  }
  return "acik";
}

export function PushAcmaButonu({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [durum, setDurum] = useState<Durum>("kontrol");
  const [hata, setHata] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);

  const hataYaz = useCallback((sorun: unknown, varsayilan: string) => {
    console.error("[push-ui]", sorun);
    setHata(sorun instanceof DashboardApiError ? sorun.message : varsayilan);
  }, []);

  useEffect(() => {
    let iptal = false;

    durumOlc()
      .then((olculen) => {
        if (!iptal) setDurum(olculen);
      })
      .catch((sorun: unknown) => {
        // Ölçüm başarısız olsa da panel çalışmalı; buton "kapalı" görünür.
        if (iptal) return;
        console.error("[push-ui] mevcut abonelik okunamadı:", sorun);
        setDurum("kapali");
      });

    return () => {
      iptal = true;
    };
  }, []);

  async function bildirimleriAc(): Promise<void> {
    setHata(null);
    setCalisiyor(true);
    try {
      const izin = await Notification.requestPermission();
      if (izin === "denied") {
        setDurum("engellendi");
        return;
      }
      if (izin !== "granted") {
        setHata("Bildirim izni verilmedi.");
        return;
      }

      const kayit = await navigator.serviceWorker.register("/sw.js");
      // `ready` beklenmezse yeni kurulan worker "installing" durumundayken
      // pushManager.subscribe çağrılır ve InvalidStateError alınır.
      await navigator.serviceWorker.ready;

      const abonelik =
        (await kayit.pushManager.getSubscription()) ??
        (await kayit.pushManager.subscribe({
          // Zorunlu: her push mesajı görünür bir bildirim üretmelidir.
          userVisibleOnly: true,
          applicationServerKey: base64UrlBaytaCevir(vapidPublicKey),
        }));

      await aboneligiSunucuyaYaz(abonelik);
      setDurum("acik");
    } catch (sorun: unknown) {
      hataYaz(sorun, "Bildirimler açılamadı. Lütfen tekrar deneyin.");
    } finally {
      setCalisiyor(false);
    }
  }

  if (durum === "kontrol" || durum === "acik") {
    return durum === "acik" ? (
      <p className="mb-5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        ✓ Bildirimler açık — yeni randevu talebi geldiğinde haber vereceğiz.
      </p>
    ) : null;
  }

  const bilgi =
    durum === "desteklenmiyor"
      ? "Bu tarayıcı bildirimleri desteklemiyor."
      : durum === "engellendi"
        ? "Bildirimler bu tarayıcıda engellenmiş. Adres çubuğundaki kilit simgesinden izin verebilirsiniz."
        : null;

  return (
    <div className="mb-5 space-y-2">
      {durum === "kapali" ? (
        <button
          type="button"
          disabled={calisiyor}
          onClick={() => void bildirimleriAc()}
          className="min-h-10 w-full rounded-xl border-2 border-neutral-900 px-4 text-sm font-semibold transition-opacity disabled:opacity-40 dark:border-white"
        >
          {calisiyor ? "Açılıyor…" : "Bildirimleri Aç"}
        </button>
      ) : null}
      {bilgi ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{bilgi}</p>
      ) : null}
      {hata ? (
        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-400">
          {hata}
        </p>
      ) : null}
    </div>
  );
}
