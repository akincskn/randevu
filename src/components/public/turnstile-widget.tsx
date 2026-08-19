"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget'ı — spec satır 75 ("basit bot/insan doğrulaması").
 *
 * Explicit render kullanılır (otomatik değil): widget'ın ne zaman kurulduğunu ve
 * ne zaman SIFIRLANDIĞINI bilmemiz gerekir. Turnstile token'ı TEK KULLANIMLIKTIR —
 * başarısız bir POST'tan sonra aynı token'la tekrar denenirse Cloudflare
 * `timeout-or-duplicate` ile reddeder. Bu yüzden her başarısız denemeden sonra
 * `sifirlamaSinyali` artırılarak yeni token istenir.
 */

interface TurnstileRenderSecenek {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  theme: "auto";
  language: "tr";
}

interface TurnstileApi {
  render: (hedef: HTMLElement, secenek: TurnstileRenderSecenek) => string | undefined;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * `NEXT_PUBLIC_*` değişkenleri derleme anında gömülür, yani SABİTTİR.
 * Modül düzeyinde okunması, eksikliğinin effect içinde setState ile değil
 * doğrudan türetilmiş bir render dalıyla ele alınmasını sağlar.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const HAZIRLIK_ZAMAN_ASIMI_MS = 10_000;
const HAZIRLIK_ARALIK_MS = 50;

let scriptYuklemesi: Promise<void> | null = null;

/**
 * api.js'i bir kez yükler ve `window.turnstile` hazır olana kadar bekler.
 *
 * `onload` olayı script'in ÇALIŞTIĞINI söyler; `window.turnstile`'ın atanmış
 * olduğunu garanti etmez. Kısa bir hazırlık yoklaması (poll) bu boşluğu kapatır —
 * aksi halde nadir bir yarışta `render` tanımsız fonksiyona çağrı yapardı.
 */
function turnstileYukle(): Promise<void> {
  if (scriptYuklemesi) return scriptYuklemesi;

  scriptYuklemesi = new Promise<void>((coz, reddet) => {
    const hazirBekle = (kalanMs: number): void => {
      if (window.turnstile) {
        coz();
        return;
      }
      if (kalanMs <= 0) {
        reddet(new Error("Turnstile yüklendi ama hazır olmadı"));
        return;
      }
      window.setTimeout(() => hazirBekle(kalanMs - HAZIRLIK_ARALIK_MS), HAZIRLIK_ARALIK_MS);
    };

    if (window.turnstile) {
      coz();
      return;
    }

    const etiket = document.createElement("script");
    etiket.src = SCRIPT_URL;
    etiket.async = true;
    etiket.defer = true;
    etiket.onload = () => hazirBekle(HAZIRLIK_ZAMAN_ASIMI_MS);
    etiket.onerror = () => {
      // Sonraki denemenin script'i yeniden çekebilmesi için önbellek temizlenir.
      scriptYuklemesi = null;
      reddet(new Error("Turnstile script'i yüklenemedi"));
    };
    document.head.appendChild(etiket);
  });

  return scriptYuklemesi;
}

const YAPILANDIRMA_HATASI =
  "Bot doğrulaması yapılandırılmamış (NEXT_PUBLIC_TURNSTILE_SITE_KEY eksik). Lütfen işletmeyle iletişime geçin.";
const YUKLEME_HATASI =
  "Doğrulama yüklenemedi. Lütfen reklam engelleyicinizi kontrol edip sayfayı yenileyin.";

interface TurnstileWidgetProps {
  /** Geçerli token üretildiğinde çağrılır; token düştüğünde `null` gelir. */
  onToken: (token: string | null) => void;
  /**
   * Widget hiç kurulamadığında çağrılır (hata mesajı), sonra düzelirse `null`.
   *
   * Form bu bilgiye MECBUR: token gelmediği için gönderim butonu zaten kilitli
   * kalır ve sebebi söylenmezse kullanıcı SESSİZ bir kilitlenmeyle karşılaşır.
   * Kilitleme davranışının kendisi bilinçlidir (PROJECT_SPEC.md "Onaylanan
   * Çıkarımlar", 2026-08-15): istemci doğrulamayı hiç yapmadıysa bot koruması
   * tamamen devre dışı kalırdı, bu yüzden sunucu tarafı fail-open buraya işlemez.
   */
  onYuklemeHatasi: (mesaj: string | null) => void;
  /** Değeri her değiştiğinde widget yeniden kurulur (yeni token üretilir). */
  sifirlamaSinyali: number;
}

export function TurnstileWidget({
  onToken,
  onYuklemeHatasi,
  sifirlamaSinyali,
}: TurnstileWidgetProps) {
  const kapsayici = useRef<HTMLDivElement>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(
    SITE_KEY ? null : YAPILANDIRMA_HATASI,
  );

  // Callback'leri ref'te tutmak, her render'da yeni referans olsalar bile
  // widget'ın gereksiz yere yeniden kurulmasını engeller.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const onHataRef = useRef(onYuklemeHatasi);
  useEffect(() => {
    onHataRef.current = onYuklemeHatasi;
  }, [onYuklemeHatasi]);

  // Hata durumunu forma bildir — buradaki metin ile formun gösterdiği gerekçe
  // tek kaynaktan beslenir, ayrışamaz.
  useEffect(() => {
    onHataRef.current(yuklemeHatasi);
  }, [yuklemeHatasi]);

  useEffect(() => {
    const hedef = kapsayici.current;
    if (!hedef || !SITE_KEY) return;

    let widgetId: string | undefined;
    let iptal = false;

    turnstileYukle()
      .then(() => {
        if (iptal || !window.turnstile) return;
        setYuklemeHatasi(null);
        hedef.replaceChildren();
        widgetId = window.turnstile.render(hedef, {
          sitekey: SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
          theme: "auto",
          language: "tr",
        });
      })
      .catch((hata: unknown) => {
        console.error("[turnstile] widget kurulamadı:", hata);
        if (iptal) return;
        setYuklemeHatasi(YUKLEME_HATASI);
      });

    return () => {
      iptal = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [sifirlamaSinyali]);

  return (
    <div className="space-y-2">
      {SITE_KEY ? <div ref={kapsayici} /> : null}
      {yuklemeHatasi ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {yuklemeHatasi}
        </p>
      ) : null}
    </div>
  );
}
