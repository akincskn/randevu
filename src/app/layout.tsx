import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Uygulama genelinde varsayılan metadata.
 *
 * `template` sayesinde alt sayfalar yalnızca kendi adlarını verir
 * ("Giriş yap" -> "Giriş yap · Randevu"); public booking sayfası ise
 * İŞLETMENİN adını başlığa taşır (bkz. `[businessSlug]/page.tsx`).
 */
export const metadata: Metadata = {
  title: {
    default: "Randevu — Berber ve Kuaför Randevu Sistemi",
    template: "%s · Randevu",
  },
  description:
    "Berber ve kuaförler için ücretsiz online randevu sistemi. " +
    "Müşterileriniz uygulama indirmeden, telefonlarından randevu alır.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // Arayüzün tamamı Türkçe; `en` bırakmak ekran okuyucuların yanlış dilde
      // seslendirmesine ve tarayıcının yanlış hecelemesine yol açıyordu.
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
