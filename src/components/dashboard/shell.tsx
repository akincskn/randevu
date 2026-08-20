"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { cikisYap, DashboardApiError, oturumGetir, type OturumBilgisi } from "@/lib/dashboard-api";
import { randevulariGetir } from "@/lib/dashboard-api-appointments";

import { KabukSaglayici } from "./shell-context";
import { Hata, Yukleniyor } from "./form-ui";
import { PendingBadge } from "./pending-badge";
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
 * Rozet burada, LAYOUT seviyesinde durur: spec satır 68 "panelde bekleyen randevu
 * sayısı HER ZAMAN görünür bir rozet ile gösterilir" diyor. Sayfaya konsaydı
 * hizmet/saat sekmelerinde kaybolurdu.
 */
export function DashboardShell({
  children,
  vapidPublicKey,
}: {
  children: ReactNode;
  /** VAPID public anahtarı; boşsa push arayüzü hiç gösterilmez (spec satır 65-67). */
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
      value={{
        bekleyenSayisi,
        rozetYenile,
        timezone: oturum.business.timezone,
        businessId: oturum.business.id,
      }}
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

        <PendingBadge bekleyenSayisi={bekleyenSayisi} />

        {/* Spec satır 65-66: yeni randevu talebinde anında push. İzin ancak
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
