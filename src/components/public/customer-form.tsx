"use client";

import { type FormEvent, useState } from "react";

import { TurnstileWidget } from "./turnstile-widget";
import { HataKutusu } from "./ui";

/**
 * Ad + telefon formu — spec satır 22-23 ("adı + telefon numarasıyla randevu
 * talebi oluşturur") ve satır 50 (müşteri hesabı YOK; şifre/e-posta istenmez).
 *
 * Gönderim, Turnstile token'ı gelene kadar kilitlidir (spec satır 46).
 * Alan doğrulaması sunucuda `randevuTalebiSemasi` ile TEKRARLANIR — buradaki
 * `required`/`pattern` yalnızca kullanıcıya erken geri bildirimdir, güvenlik sınırı değil.
 */
export function CustomerForm({
  ad,
  telefon,
  onAdChange,
  onTelefonChange,
  onTokenChange,
  turnstileSifirlama,
  tokenHazir,
  gonderiliyor,
  hata,
  onGonder,
}: {
  ad: string;
  telefon: string;
  onAdChange: (deger: string) => void;
  onTelefonChange: (deger: string) => void;
  onTokenChange: (token: string | null) => void;
  turnstileSifirlama: number;
  tokenHazir: boolean;
  gonderiliyor: boolean;
  hata: string | null;
  onGonder: () => void;
}) {
  /**
   * Turnstile hiç kurulamadıysa gönderim kilitli KALIR (bilinçli — bkz.
   * `turnstile-widget.tsx`), ama kilidin sebebi kullanıcıya söylenir.
   * Sessiz kilitlenme, kullanıcının neyi düzelteceğini bilememesi demektir.
   */
  const [dogrulamaHatasi, setDogrulamaHatasi] = useState<string | null>(null);

  function gonderimiYakala(olay: FormEvent<HTMLFormElement>): void {
    olay.preventDefault();
    onGonder();
  }

  const alanSinifi =
    "min-h-11 w-full rounded-xl border-2 border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:focus:border-white";

  return (
    <form onSubmit={gonderimiYakala} className="space-y-3" noValidate>
      <div className="space-y-1">
        <label htmlFor="musteri-ad" className="block text-sm font-medium">
          Adınız
        </label>
        <input
          id="musteri-ad"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={80}
          value={ad}
          onChange={(olay) => onAdChange(olay.target.value)}
          className={alanSinifi}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="musteri-telefon" className="block text-sm font-medium">
          Telefon numaranız
        </label>
        <input
          id="musteri-telefon"
          name="tel"
          // `type="tel"` mobilde numerik tuş takımını açar; metin girişine izin
          // verir çünkü sunucu 0/+90 gibi önekleri zaten normalize ediyor.
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="0532 111 22 33"
          value={telefon}
          onChange={(olay) => onTelefonChange(olay.target.value)}
          className={alanSinifi}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Berber onay mesajını bu numaraya WhatsApp&apos;tan gönderecek.
        </p>
      </div>

      <TurnstileWidget
        onToken={onTokenChange}
        onYuklemeHatasi={setDogrulamaHatasi}
        sifirlamaSinyali={turnstileSifirlama}
      />

      {hata ? <HataKutusu mesaj={hata} /> : null}

      <button
        type="submit"
        disabled={gonderiliyor || !tokenHazir}
        className="min-h-12 w-full rounded-xl bg-neutral-900 px-4 font-semibold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {gonderiliyor ? "Gönderiliyor…" : "Randevu talebi oluştur"}
      </button>

      {!tokenHazir && !gonderiliyor ? (
        <p
          className={`text-center text-xs ${
            dogrulamaHatasi
              ? "font-medium text-red-700 dark:text-red-400"
              : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {dogrulamaHatasi
            ? "Doğrulama tamamlanmadığı için randevu talebi gönderilemiyor."
            : "Bot doğrulaması tamamlanınca gönderebilirsiniz."}
        </p>
      ) : null}
    </form>
  );
}
