# Yol Haritası — Berber/Kuaför Randevu Sistemi

Fazlar SIRAYLA yürütülür. Bir fazı atlamak veya sırayı değiştirmek — teknik bir bağımlılık
gerektirse bile — kullanıcı onayı olmadan YAPILAMAZ. Önce sor, sonra uygula.

Her faza başlamadan önce şunlar belirtilir:
1. Hangi fazdayız,
2. Bir sonraki faz `PROJECT_SPEC.md`'nin hangi bölümüne dayanıyor.

Kapsam kaynağı her zaman `PROJECT_SPEC.md`'dir. Orada yazmayan hiçbir şey bu yol haritasına
dayanarak eklenemez (bkz. `CLAUDE.md` §0 Zero-Ambiguity Protocol).

---

## Faz 1 — Veritabanı ✅ TAMAMLANDI

Spec dayanağı: satır 14-19 (Business, hizmet listesi, çalışma saatleri, istisnalar),
satır 43-44 (slot çakışmasının veritabanı seviyesinde engellenmesi).

- Prisma 7 + Neon PostgreSQL kurulumu, `prisma.config.ts` (`DIRECT_URL` ile migration)
- 6 model: `Business`, `Service`, `WorkingHours`, `WorkingHoursException`,
  `Appointment`, `PushSubscription`
- `AppointmentStatus` enum — 6 değer (slot TUTAN / BIRAKAN ayrımı)
- `Appointment_no_overlap_excl` — `btree_gist` + `EXCLUDE USING gist`, aralık çakışması koruması
- `Service_durationMinutes_positive_check` — sıfır uzunluklu randevu boşluğunu kapatır
- Neon'a deploy edildi ve veritabanı üzerinden doğrulandı

## Faz 2 — API Routes + Minimal Auth (API-only, UI Faz 4'te) ✅ TAMAMLANDI

Spec dayanağı: satır 22-23 (randevu talebi oluşturma), satır 25-29 (onay + `wa.me` linki),
satır 41-46 (güvenlik: rastgele token, rate limiting, bot doğrulaması), satır 36-38 (push aboneliği),
**satır 48-49 (berber kimlik doğrulaması — yalnızca API katmanı)**.

- ✅ `POST /api/appointments` — public, rate-limited (Upstash), Turnstile doğrulaması
- ✅ `POST /api/auth/register` — email + şifre (scrypt hash'li), `Business` kaydı oluşturur
- ✅ `POST /api/auth/login` — HMAC imzalı session cookie üretir
- ✅ Session doğrulama helper'ı (`src/lib/session.ts`) — `confirm` ve `push/subscribe` kullanır
- ✅ `PATCH /api/appointments/[id]/confirm` — durum `CONFIRMED`, `wa.me` link üretimi.
  Session'daki `businessId` ile `appointment.businessId` eşleşmelidir; eşleşmezse **403**.
- ✅ `PATCH /api/appointments/[id]/cancel` — müşteri `publicToken` ile, berber session ile
- ✅ `POST /api/push/subscribe` — `businessId` gövdeden değil session'dan alınır

Her route: Zod ile input doğrulama, try/catch, DTO ile yanıt (`CLAUDE.md` §2).

Doğrulama durumu: `npm run build` ve `npx eslint src` temiz. Üç tur qa-tester doğrulaması
yapıldı; slot çakışmasının **409 SLOT_TAKEN** döndürdüğü canlı Neon'da eşzamanlı isteklerle
kanıtlandı. Bulunan dört hata düzeltildi ve yeniden doğrulandı: `isSlotConflict`'in yanlış
hata alanına bakması (6a9207d), rate limit sayacının negatife düşüp limiti bypass etmesi,
`login`'de 45 ms'lik hesap numaralandırma sızıntısı, `push/subscribe`'da abonelik ele
geçirme (728b3dc).

**Auth kapsam sınırı — bu fazda YOK, Faz 4'e ait:** login/register SAYFALARI (UI),
dashboard arayüzü, şifre sıfırlama, magic link alternatifi. Bunlar auth API'sinin üstüne biner.

> Neden Faz 2'ye çekildi: `confirm` bir berber işlemidir ve kimlik doğrulaması olmadan
> randevu ID'sini bilen herkes başkasının randevusunu onaylayabilirdi. Sıra değişikliği
> 2026-08-15'te kullanıcı onayıyla yapıldı.

## Faz 3 — Public booking sayfası ⬅️ SIRADAKİ

Spec dayanağı: satır 22 (hizmet seçimi, uygun saatlerin gösterimi, ad + telefon ile talep),
satır 30 (müşteri randevu detay ekranı), satır 46 (Turnstile).

Uygulama indirmeden çalışan mobil web arayüzü.

> Bilinen ön koşul: MÜSAİT SLOT ÜRETECİ henüz yazılmadı. `src/lib/availability.ts` verilen
> bir saatin çalışma saatleri içinde olup olmadığını DOĞRULAR, ancak "bu gün için müsait
> saatler hangileri" sorusunu cevaplamaz. Spec satır 22 "uygun saati görür" dediği için
> Faz 3, mevcut randevuları da hesaba katan bir slot üreteci gerektirir.

## Faz 4 — Dashboard

Spec dayanağı: satır 14-19 (hizmet ve çalışma saati yönetimi), satır 24 (bekleyen randevular),
satır 39 (her zaman görünür bekleyen sayısı rozeti), satır 48-49 (berber kimlik doğrulaması — UI katmanı).

Berber girişi, randevu listesi, bekleyen rozeti, hizmet ve çalışma saati yönetimi.

Auth tarafında bu faza kalanlar (API'si Faz 2'de yazıldı): login/register sayfaları,
şifre sıfırlama, magic link alternatifi.

## Faz 5 — Push bildirimleri

Spec dayanağı: satır 36-38. VAPID, Firebase yok, ücretsiz.

- Yeni randevu talebi geldiğinde anında bildirim
- Günlük özet: "N bekleyen randevunuz var" (dükkan açılışına yakın)

## Faz 6 — Cron (zaman aşımı süpürmesi)

Spec dayanağı: satır 32-35. Sabit "2 saat" kuralı YOK; zaman aşımı işletmenin çalışma
saatlerine göre hesaplanır, kapalı saatlerde geçen süre sayılmaz.

`Business.timezone` + `WorkingHours` üzerinden hesaplama; süresi dolan randevular `EXPIRED`.

## Faz 7 — Uçtan uca QA

Spec dayanağı: `PROJECT_SPEC.md`'nin tamamı — tüm acceptance criteria.

Kapsam dışı maddelerin (satır 52-59) sızmadığının ve v2 maddelerinin (satır 61-66)
implement edilmediğinin doğrulanması dahil.

## Faz 8 — İlk deploy

Vercel free tier (`CLAUDE.md` §1). Ortam değişkenleri, Neon bağlantısı, cron yapılandırması.
