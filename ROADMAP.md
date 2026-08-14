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

## Faz 2 — API Routes ⬅️ SIRADAKİ

Spec dayanağı: satır 22-23 (randevu talebi oluşturma), satır 25-29 (onay + `wa.me` linki),
satır 41-46 (güvenlik: rastgele token, rate limiting, bot doğrulaması), satır 36-38 (push aboneliği).

- `POST /api/appointments` — public, rate-limited (Upstash), Turnstile doğrulaması
- `PATCH /api/appointments/[id]/confirm` — durum `CONFIRMED`, `wa.me` link üretimi
- `PATCH /api/appointments/[id]/cancel`
- `POST /api/push/subscribe`

Her route: Zod ile input doğrulama, try/catch, DTO ile yanıt (`CLAUDE.md` §2).

## Faz 3 — Public booking sayfası

Spec dayanağı: satır 22 (hizmet seçimi, uygun saatlerin gösterimi, ad + telefon ile talep),
satır 30 (müşteri randevu detay ekranı), satır 46 (Turnstile).

Uygulama indirmeden çalışan mobil web arayüzü.

## Faz 4 — Dashboard

Spec dayanağı: satır 14-19 (hizmet ve çalışma saati yönetimi), satır 24 (bekleyen randevular),
satır 39 (her zaman görünür bekleyen sayısı rozeti), satır 48-49 (berber kimlik doğrulaması).

Berber girişi, randevu listesi, bekleyen rozeti, hizmet ve çalışma saati yönetimi.

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
