import type { Metadata } from "next";
import { LoginForm } from "@/components/dashboard/login-form";

export const metadata: Metadata = { title: "Giriş yap" };

/** Berber giriş sayfası — spec satır 67-68'un UI katmanı (API'si Faz 2'de yazıldı). */
export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Giriş yap</h1>
      <LoginForm />
    </main>
  );
}
