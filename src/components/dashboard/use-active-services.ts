"use client";

import { useEffect, useState } from "react";

import { DashboardApiError, hizmetleriGetir } from "@/lib/dashboard-api";
import type { ServiceAdminDto } from "@/lib/dto-dashboard";

/**
 * Panelin AKTİF hizmet listesi.
 *
 * `manual-appointment-form.tsx`'ten ayrıldı: o dosya 200 satır sınırına
 * (CLAUDE.md §2) dayandı ve veri çekme, form durumundan bağımsız bir sorumluluk.
 *
 * Pasifler ELENİR: `POST /api/appointments/manual` da `isActive: true` filtresi
 * uyguluyor (kullanıcı kararı, 2026-08-19). Listede gösterip 404 aldırmak
 * yanıltıcı olurdu.
 */
export interface AktifHizmetler {
  /** Yükleme sürerken `null`. */
  liste: ServiceAdminDto[] | null;
  hata: string | null;
}

export function useAktifHizmetler(): AktifHizmetler {
  const [durum, setDurum] = useState<AktifHizmetler>({ liste: null, hata: null });

  useEffect(() => {
    let iptal = false;
    hizmetleriGetir()
      .then((veri) => {
        if (iptal) return;
        setDurum({ liste: veri.services.filter((hizmet) => hizmet.isActive), hata: null });
      })
      .catch((sorun: unknown) => {
        if (iptal) return;
        setDurum({
          liste: [],
          hata: sorun instanceof DashboardApiError ? sorun.message : "Hizmetler alınamadı.",
        });
      });
    return () => {
      iptal = true;
    };
  }, []);

  return durum;
}
