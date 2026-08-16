import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { cronEnv } from "./env";

/**
 * Cron endpoint'inin ortak sır (shared secret) koruması.
 *
 * `api/cron/*` yolu KİMLİK DOĞRULAMASIZ erişilebilir bir URL'dir: adresi bulan
 * herkes süpürmeyi tetikleyebilir, yani başkasının bekleyen randevularını
 * EXPIRED'a düşürebilirdi. Oturum cookie'si burada işe yaramaz — çağıran bir
 * tarayıcı değil, QStash'tir.
 *
 * Taşıyıcı: `Authorization: Bearer <CRON_SECRET>` (kullanıcı kararı, 2026-08-16).
 * QStash imza doğrulaması yerine bu seçildi; sağlayıcıdan bağımsız kalır ve
 * `curl` ile elle test edilebilir.
 */
export function cronYetkisiDogrula(request: NextRequest): void {
  const beklenen = cronEnv().CRON_SECRET;

  const baslik = request.headers.get("authorization") ?? "";
  const onEk = "Bearer ";
  if (!baslik.startsWith(onEk)) {
    throw new ApiError("UNAUTHORIZED", 401, "Cron yetkilendirmesi geçersiz.");
  }

  const gelen = Buffer.from(baslik.slice(onEk.length));
  const dogru = Buffer.from(beklenen);

  // Uzunluk farkı `timingSafeEqual`'ı FIRLATIR, bu yüzden önce kontrol edilir.
  // Uzunluğun sızması kabul edilebilir: sır sabit uzunlukta ve rastgeledir.
  if (gelen.length !== dogru.length || !timingSafeEqual(gelen, dogru)) {
    throw new ApiError("UNAUTHORIZED", 401, "Cron yetkilendirmesi geçersiz.");
  }
}
