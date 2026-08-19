import type { Metadata } from "next";
import { RegisterForm } from "@/components/dashboard/register-form";

export const metadata: Metadata = { title: "Kayıt ol" };

/** Berber kayıt sayfası — spec satır 15-16 + 68'in UI katmanı. */
export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Kayıt ol</h1>
      <RegisterForm />
    </main>
  );
}
