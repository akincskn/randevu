"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { dashboardYaz, DashboardApiError } from "@/lib/dashboard-api";

import { Alan, ALAN_SINIFI, AnaButon, Hata } from "./form-ui";

/**
 * Berber giriş formu — spec satır 49 ("basit email/şifre").
 *
 * Faz 2'de yazılmış `POST /api/auth/login` çağrılır; oturum cookie'sini SUNUCU
 * `Set-Cookie` ile kurar (`HttpOnly`, bkz. `session.ts`). Burada token'a dokunulmaz.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: FormEvent<HTMLFormElement>): Promise<void> {
    olay.preventDefault();
    setGonderiliyor(true);
    setHata(null);
    try {
      await dashboardYaz("/api/auth/login", "POST", { email, password: sifre });
      // `refresh()` şart: cookie yeni kuruldu, sunucu bileşenleri eski oturumsuz
      // yanıtı önbellekte tutuyor olabilir.
      router.replace("/dashboard");
      router.refresh();
    } catch (sorun: unknown) {
      setHata(
        sorun instanceof DashboardApiError ? sorun.message : "Giriş yapılamadı.",
      );
      setGonderiliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      <Alan id="email" etiket="E-posta">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(o) => setEmail(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      <Alan id="sifre" etiket="Şifre">
        <input
          id="sifre"
          type="password"
          autoComplete="current-password"
          required
          value={sifre}
          onChange={(o) => setSifre(o.target.value)}
          className={ALAN_SINIFI}
        />
      </Alan>

      {hata ? <Hata mesaj={hata} /> : null}

      <AnaButon disabled={gonderiliyor}>
        {gonderiliyor ? "Giriş yapılıyor…" : "Giriş yap"}
      </AnaButon>

      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
        Hesabınız yok mu?{" "}
        <Link href="/register" className="font-semibold underline">
          Kayıt olun
        </Link>
      </p>
    </form>
  );
}
