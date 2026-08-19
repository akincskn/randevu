import type { WorkingHours, WorkingHoursException } from "@prisma/client";

import { gunlukOzetKilidiAl } from "./digest-lock";
import { type CalismaTakvimi, gunlukAcikPencere, randevuSuresiDolduMu } from "./expiry";
import { prisma } from "./prisma";
import { gunlukBekleyenOzetiGonder } from "./push-notifications";
import { withTimeout } from "./timeout";
import { yerelAnHesapla } from "./timezone";

/**
 * ZAMAN AŞIMI SÜPÜRMESİ — spec satır 61-64 ve 67'nin yürütücüsü.
 *
 * `expiry.ts` "bu randevunun süresi doldu mu?" sorusunu SAF olarak cevaplar;
 * bu modül veritabanını okur, kararı uygular ve günlük özeti tetikler. Route
 * katmanı (api/cron/expire-appointments) yalnızca kimlik doğrulayıp burayı çağırır.
 */

/** QStash cron aralığı (kullanıcı kararı, 2026-08-16). Özet penceresi buna dayanır. */
export const CRON_ARALIK_DAKIKA = 15;

/**
 * Günlük özetin gönderilebileceği pencere: açılıştan sonraki ilk 30 dakika.
 *
 * Cron aralığından (15 dk) GENİŞ tutuldu ki tek bir tur kaçırıldığında o günün
 * özeti tamamen düşmesin. Mükerrer gönderimi `digest-lock.ts` engeller — pencere
 * genişliği ile "günde bir kez" garantisi birbirinden bağımsızdır.
 */
export const OZET_PENCERESI_DAKIKA = 30;

/** İstisna sorgusuna eklenen emniyet payı: saat dilimi farkı bir günü aşamaz. */
const ISTISNA_PAYI_GUN = 2;

/** Veritabanı çağrıları için zaman aşımı (CLAUDE.md §2: tüm dış çağrılarda zorunlu). */
const DB_ZAMAN_ASIMI_MS = 10_000;

export interface SupurmeSonucu {
  /** Taranan işletme sayısı. */
  isletme: number;
  /** İncelenen PENDING randevu sayısı. */
  incelenen: number;
  /** EXPIRED'a çevrilen randevu sayısı. */
  sureDolan: number;
  /** Günlük özet bildirimi tetiklenen işletme sayısı. */
  ozetGonderilen: number;
}

/**
 * İstisna kayıtlarının okunacağı en eski takvim günü.
 *
 * En eski PENDING randevudan geriye gidilir: birikim hesabı o randevunun
 * `createdAt`'inden bugüne kadar her günün açık/kapalı olduğunu bilmek zorunda.
 * Bekleyen randevu yoksa yalnızca günlük özet için bugünün istisnası yeter.
 */
async function istisnaAltSiniri(simdi: Date): Promise<Date> {
  const enEski = await withTimeout(
    prisma.appointment.aggregate({
      _min: { createdAt: true },
      where: { status: "PENDING" },
    }),
    DB_ZAMAN_ASIMI_MS,
    "Prisma en eski bekleyen randevu sorgusu",
  );

  const taban = enEski._min.createdAt ?? simdi;
  return new Date(taban.getTime() - ISTISNA_PAYI_GUN * 86_400_000);
}

/** Prisma satırlarından `expiry.ts`'in beklediği takvimi kurar. */
function takvimKur(isletme: {
  timezone: string;
  workingHours: WorkingHours[];
  hoursExceptions: WorkingHoursException[];
}): CalismaTakvimi {
  return {
    timezone: isletme.timezone,
    haftalik: new Map(isletme.workingHours.map((h) => [h.dayOfWeek, h])),
    // `date` bir DATE kolonudur (saat taşımaz); anahtar UTC'den kesilir çünkü
    // Prisma bu değeri gece yarısı UTC olarak döndürür.
    istisnalar: new Map(
      isletme.hoursExceptions.map((i) => [i.date.toISOString().slice(0, 10), i]),
    ),
  };
}

/**
 * Günlük özet penceresinde miyiz?
 *
 * Spec satır 67: "dükkan açılışına yakın bir saatte". Karşılaştırma MUTLAK
 * zamanda yapılır (duvar saati dakikası yerine) — yaz saati geçişinde duvar
 * saati aritmetiği yanıltıcı olurdu.
 */
function ozetPenceresindeMi(takvim: CalismaTakvimi, simdi: Date, isoGun: string): boolean {
  const pencere = gunlukAcikPencere(takvim, isoGun);
  if (!pencere) return false;

  const gecen = simdi.getTime() - pencere.acilis.getTime();
  return gecen >= 0 && gecen < OZET_PENCERESI_DAKIKA * 60_000;
}

/**
 * Süresi dolan randevuları EXPIRED'a çevirir.
 *
 * `status: "PENDING"` koşulu WHERE'de TEKRAR edilir: hesaplama ile yazma arasında
 * berber randevuyu onaylamış olabilir. Bu koşul olmadan cron, berberin CONFIRMED
 * yaptığı bir randevuyu ezerdi.
 *
 * EXCLUDE kısıtı açısından güvenlidir: PENDING slotu TUTAR, EXPIRED BIRAKIR —
 * yani bu güncelleme kısıtın kapsamından satır ÇIKARIR, hiç çakışma üretemez.
 */
async function sureDolanlariIsaretle(idler: string[]): Promise<number> {
  if (idler.length === 0) return 0;

  const sonuc = await withTimeout(
    prisma.appointment.updateMany({
      where: { id: { in: idler }, status: "PENDING" },
      data: { status: "EXPIRED" },
    }),
    DB_ZAMAN_ASIMI_MS,
    "Prisma zaman aşımı güncellemesi",
  );

  return sonuc.count;
}

/**
 * Tek bir süpürme turu: zaman aşımı + günlük özet.
 *
 * Özet, güncellemeden SONRA gönderilir — böylece "N bekleyen randevunuz var"
 * sayısı az önce düşen randevuları İÇERMEZ.
 */
export async function zamanAsimiSupurmesiCalistir(simdi: Date = new Date()): Promise<SupurmeSonucu> {
  const istisnaTabani = await istisnaAltSiniri(simdi);

  const isletmeler = await withTimeout(
    prisma.business.findMany({
      select: {
        id: true,
        timezone: true,
        workingHours: true,
        hoursExceptions: { where: { date: { gte: istisnaTabani } } },
        appointments: {
          where: { status: "PENDING" },
          select: { id: true, createdAt: true, startsAt: true },
        },
      },
    }),
    DB_ZAMAN_ASIMI_MS,
    "Prisma işletme + bekleyen randevu sorgusu",
  );

  const sonuc: SupurmeSonucu = {
    isletme: isletmeler.length,
    incelenen: 0,
    sureDolan: 0,
    ozetGonderilen: 0,
  };

  for (const isletme of isletmeler) {
    let takvim: CalismaTakvimi;
    let isoGun: string;
    try {
      takvim = takvimKur(isletme);
      isoGun = yerelAnHesapla(simdi, isletme.timezone).isoGun;
    } catch (error) {
      // Bozuk bir `timezone` değeri TÜM süpürmeyi durdurmamalı; diğer işletmeler işlenir.
      console.error("[cron] işletme takvimi çözülemedi, atlanıyor:", isletme.id, error);
      continue;
    }

    sonuc.incelenen += isletme.appointments.length;
    const dolanlar = isletme.appointments
      .filter((randevu) => randevuSuresiDolduMu(takvim, randevu, simdi))
      .map((randevu) => randevu.id);

    try {
      sonuc.sureDolan += await sureDolanlariIsaretle(dolanlar);
    } catch (error) {
      console.error("[cron] zaman aşımı güncellemesi başarısız:", isletme.id, error);
    }

    if (!ozetPenceresindeMi(takvim, simdi, isoGun)) continue;
    if (!(await gunlukOzetKilidiAl(isletme.id, isoGun))) continue;

    // `gunlukBekleyenOzetiGonder` ASLA fırlatmaz (Faz 5 sözleşmesi) ve bekleyen
    // sayısı 0 ise hiç göndermez — o durumda `toplam` 0 kalır.
    const push = await gunlukBekleyenOzetiGonder(isletme.id);
    if (push.toplam > 0) sonuc.ozetGonderilen += 1;
  }

  return sonuc;
}
