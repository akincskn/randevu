"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  cikisYap,
  DashboardApiError,
  oturumGetir,
  randevulariGetir,
  type OturumBilgisi,
} from "@/lib/dashboard-api";

import { KabukSaglayici } from "./shell-context";
import { Hata, Yukleniyor } from "./form-ui";
import { PushAcmaButonu } from "./push-toggle";

const SEKMELER = [
  { yol: "/dashboard", etiket: "Bugün" },
  { yol: "/dashboard/appointments", etiket: "Randevular" },
  { yol: "/dashboard/services", etiket: "Hizmetler" },
  { yol: "/dashboard/hours", etiket: "Çalışma saatleri" },
] as const;

/**
 * Panel kabuğu — oturum koruması + kalıcı bekleyen randevu rozeti.
 *
 * Rozet burada, LAYOUT seviyesinde durur: spec satır 58 "panelde bekleyen randevu
 * sayısı HER ZAMAN görünür bir rozet ile gösterilir" diyor. Sayfaya konsaydı
 * hizmet/saat sekmelerinde kaybolurdu.
 */
export function DashboardShell({
  children,
  vapidPublicKey,
}: {
  children: ReactNode;
  /** VAPID public anahtarı; boşsa push arayüzü hiç gösterilmez (spec satır 55-57). */
  vapidPublicKey: string;
}) {
  const router = useRouter();
  const yol = usePathname();

  const [oturum, setOturum] = useState<OturumBilgisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekleyenSayisi, setBekleyenSayisi] = useState(0);
  const [rozetSayaci, setRozetSayaci] = useState(0);

  const rozetYenile = useCallback(() => setRozetSayaci((n) => n + 1), []);

  useEffect(() => {
    let iptal = false;
    oturumGetir()
      .then((veri) => {
        if (!iptal) setOturum(veri);
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        // Oturum düştüyse hata göstermek yanlış olur — kullanıcı sadece giriş yapmalı.
        if (sorun instanceof DashboardApiError && sorun.oturumDustu) {
          router.replace("/login");
          return;
        }
        setHata(
          sorun instanceof DashboardApiError ? sorun.message : "Oturum bilgisi alınamadı.",
        );
      });
    return () => {
      iptal = true;
    };
  }, [router]);

  useEffect(() => {
    if (!oturum) return;
    let iptal = false;
    randevulariGetir("pending")
      .then((veri) => {
        if (!iptal) setBekleyenSayisi(veri.pendingCount);
      })
      .catch((sorun: unknown) => {
        // Rozet sayısı alınamazsa panel kullanılamaz hale gelmemeli; loglanır.
        console.error("[dashboard] bekleyen sayısı alınamadı:", sorun);
      });
    return () => {
      iptal = true;
    };
  }, [oturum, rozetSayaci]);

  async function cikis(): Promise<void> {
    try {
      await cikisYap();
    } catch (sorun: unknown) {
      console.error("[dashboard] çıkış isteği başarısız:", sorun);
    }
    router.replace("/login");
    router.refresh();
  }

  if (hata) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Hata mesaj={hata} />
      </main>
    );
  }

  if (!oturum) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Yukleniyor metin="Panel yükleniyor…" />
      </main>
    );
  }

  return (
    <KabukSaglayici
      value={{ bekleyenSayisi, rozetYenile, timezone: oturum.business.timezone }}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{oturum.business.name}</h1>
            <Link
              href={`/${oturum.business.slug}`}
              className="text-xs text-neutral-500 underline dark:text-neutral-400"
            >
              /{oturum.business.slug} — randevu sayfanız
            </Link>
          </div>
          <button
            type="button"
            onClick={() => void cikis()}
            className="shrink-0 text-sm font-semibold underline"
          >
            Çıkış
          </button>
        </header>

        {/* Spec satır 24 + 58: bekleyen randevu rozeti BELİRGİN ve gözden kaçmaz.
            Sıfırken de gösterilir ama sakin renkte — "her zaman görünür" şartı,
            yalnızca bekleyen varken göstermeyi dışlıyor. */}
        <Link
          href="/dashboard/appointments?scope=pending"
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 ${
            bekleyenSayisi > 0
              ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
              : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
          }`}
        >
          <span className="font-semibold">
            {bekleyenSayisi > 0
              ? `${bekleyenSayisi} randevu onayınızı bekliyor`
              : "Bekleyen randevu yok"}
          </span>
          <span
            aria-label={`${bekleyenSayisi} bekleyen randevu`}
            className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-lg font-bold tabular-nums ${
              bekleyenSayisi > 0
                ? "bg-amber-500 text-white"
                : "bg-neutral-300 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
            }`}
          >
            {bekleyenSayisi}
          </span>
        </Link>

        {/* Spec satır 55-56: yeni randevu talebinde anında push. İzin ancak
            kullanıcı hareketiyle istenebilir, bu yüzden ayrı bir buton gerekir. */}
        {vapidPublicKey ? <PushAcmaButonu vapidPublicKey={vapidPublicKey} /> : null}

        <nav className="mb-6 -mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2">
            {SEKMELER.map((sekme) => {
              const aktif = yol === sekme.yol;
              return (
                <li key={sekme.yol}>
                  <Link
                    href={sekme.yol}
                    aria-current={aktif ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-lg border-2 px-3 py-2 text-sm font-semibold ${
                      aktif
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    {sekme.etiket}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {children}
      </div>
    </KabukSaglayici>
  );
}
