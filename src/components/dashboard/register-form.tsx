"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { dashboardYaz, DashboardApiError } from "@/lib/dashboard-api";

import { Alan, ALAN_SINIFI, AnaButon, Hata } from "./form-ui";

/**
 * Berber kayıt formu — spec satır 15-16 (isim, telefon, opsiyonel adres, sektör)
 * + satır 68 (email/şifre).
 *
 * `slug` GÖNDERİLMEZ: public link tanımlayıcısını sunucu işletme adından üretir
 * ve çakışmayı kendisi çözer (bkz. `api/auth/register/route.ts`).
 */
export function RegisterForm() {
  const router = useRouter();
  const [alan, setAlan] = useState({
    name: "",
    phone: "",
    address: "",
    sector: "BERBER",
    email: "",
    password: "",
  });
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const guncelle = (ad: keyof typeof alan) => (deger: string) =>
    setAlan((onceki) => ({ ...onceki, [ad]: deger }));

  async function gonder(olay: FormEvent<HTMLFormElement>): Promise<void> {
    olay.preventDefault();
    setGonderiliyor(true);
    setHata(null);
    try {
      await dashboardYaz("/api/auth/register", "POST", {
        ...alan,
        // Boş adres GÖNDERİLMEZ: şema `.optional()` bekliyor, boş string
        // `max(200)` testinden geçse de anlamsız bir kayıt yaratırdı.
        address: alan.address.trim() === "" ? undefined : alan.address,
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (sorun: unknown) {
      setHata(sorun instanceof DashboardApiError ? sorun.message : "Kayıt oluşturulamadı.");
      setGonderiliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      <Alan id="name" etiket="İşletme adı">
        <input
          id="name"
          required
          maxLength={100}
          value={alan.name}
          onChange={(o) => guncelle("name")(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="phone" etiket="WhatsApp numaranız" ipucu="Onay mesajlarını bu numaradan göndereceksiniz.">
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="0532 111 22 33"
          value={alan.phone}
          onChange={(o) => guncelle("phone")(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="sector" etiket="Sektör">
        <select
          id="sector"
          value={alan.sector}
          onChange={(o) => guncelle("sector")(o.target.value)}
          className={ALAN_SINIFI}
        >
          <option value="BERBER">Berber</option>
          <option value="KUAFOR">Kuaför</option>
        </select>
      </Alan>

      <Alan id="address" etiket="Adres (opsiyonel)">
        <input
          id="address"
          maxLength={200}
          value={alan.address}
          onChange={(o) => guncelle("address")(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="email" etiket="E-posta">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={alan.email}
          onChange={(o) => guncelle("email")(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="password" etiket="Şifre" ipucu="En az 8 karakter.">
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={alan.password}
          onChange={(o) => guncelle("password")(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      {hata ? <Hata mesaj={hata} /> : null}

      <AnaButon disabled={gonderiliyor}>
        {gonderiliyor ? "Kayıt oluşturuluyor…" : "Kayıt ol"}
      </AnaButon>

      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="font-semibold underline">
          Giriş yapın
        </Link>
      </p>
    </form>
  );
}
