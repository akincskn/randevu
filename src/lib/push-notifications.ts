import { prisma } from "./prisma";
import { isletmeyePushGonder, type PushSonucu } from "./push";
import { yerelAnHesapla } from "./timezone";

/**
 * Bildirim METİNLERİ — spec satır 36-38:
 *   - Yeni randevu talebi geldiğinde ANINDA (POST /api/appointments çağırır)
 *   - Günlük özet: "N bekleyen randevunuz var" (dükkan açılışına yakın)
 *
 * KAPSAM SINIRI: burada yalnızca içerik üretilir ve gönderilir. Günlük özetin
 * ZAMANLAMASI bu fazın işi DEĞİL — `gunlukBekleyenOzetiGonder` bir zamanlayıcı
 * tarafından çağrılmak üzere hazır durur, çağıran mekanizma Faz 6'da yazılacak
 * (ROADMAP.md Faz 6). Bu dosyada cron, setInterval veya benzeri hiçbir
 * zamanlayıcı YOKTUR.
 */

/** Bildirime tıklanınca açılacak yol (kullanıcı kararı, 2026-08-16). */
const HEDEF_YOL = "/dashboard/appointments?scope=pending";

/**
 * Randevu saatini berberin okuyacağı biçime çevirir.
 *
 * BUGÜNSE sadece saat ("14:30"), başka günse gün de eklenir ("5 Eylül 14:30") —
 * kullanıcı kararı, 2026-08-16. Biçimleme İŞLETMENİN saat diliminde yapılır,
 * sunucununkinde değil (sunucu Vercel'de UTC'dir).
 */
function randevuZamaniBicimle(startsAt: Date, timezone: string): string {
  const bicimle = (secenek: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("tr-TR", { timeZone: timezone, ...secenek }).format(startsAt);

  const saat = bicimle({ hour: "2-digit", minute: "2-digit", hour12: false });

  const randevuGunu = yerelAnHesapla(startsAt, timezone).isoGun;
  const bugun = yerelAnHesapla(new Date(), timezone).isoGun;
  if (randevuGunu === bugun) {
    return saat;
  }

  return `${bicimle({ day: "numeric", month: "long" })} ${saat}`;
}

export interface YeniRandevuBildirimi {
  businessId: string;
  /** `Business.timezone` — çağıran zaten okumuş olur, ikinci sorgu açılmaz. */
  timezone: string;
  customerName: string;
  startsAt: Date;
}

/**
 * "Yeni randevu talebi" bildirimi (spec satır 37 — "anında").
 *
 * Çağıran ana akışı bloklamamalıdır; bu fonksiyon `isletmeyePushGonder` gibi
 * ASLA FIRLATMAZ.
 */
export function yeniRandevuTalebiBildir(girdi: YeniRandevuBildirimi): Promise<PushSonucu> {
  return isletmeyePushGonder(girdi.businessId, {
    baslik: "Yeni randevu talebi",
    govde: `${girdi.customerName}, ${randevuZamaniBicimle(girdi.startsAt, girdi.timezone)}`,
    url: HEDEF_YOL,
    // Randevu bazlı DEĞİL: arka arkaya gelen talepler tek bildirimde toplanır,
    // berberin bildirim gölgeliği yüzlerce satırla dolmaz.
    etiket: "yeni-randevu",
  });
}

/**
 * Günlük özet: "N bekleyen randevunuz var" (spec satır 38).
 *
 * ROADMAP.md ve kullanıcı yazışmasında `sendDailyPendingDigest(businessId)`
 * olarak anılan fonksiyon budur; ad, dosyadaki diğer yardımcılarla tutarlı
 * olsun diye Türkçeleştirildi. Faz 6'daki cron BUNU çağıracak.
 *
 * Bekleyen randevu YOKSA hiç bildirim gönderilmez (kullanıcı kararı, 2026-08-16):
 * berber boş yere rahatsız edilmemeli.
 */
export async function gunlukBekleyenOzetiGonder(businessId: string): Promise<PushSonucu> {
  const bos: PushSonucu = { toplam: 0, basarili: 0, silinen: 0, basarisiz: 0 };

  let bekleyen: number;
  try {
    bekleyen = await prisma.appointment.count({
      where: { businessId, status: "PENDING" },
    });
  } catch (error) {
    console.error("[push] günlük özet için bekleyen sayısı okunamadı:", businessId, error);
    return bos;
  }

  if (bekleyen === 0) {
    return bos;
  }

  return isletmeyePushGonder(businessId, {
    baslik: "Bekleyen randevular",
    govde: `${bekleyen} bekleyen randevunuz var`,
    url: HEDEF_YOL,
    etiket: "gunluk-ozet",
  });
}
