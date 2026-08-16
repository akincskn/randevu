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

## Faz 3 — Public booking sayfası ✅ TAMAMLANDI

Spec dayanağı: satır 22 (hizmet seçimi, uygun saatlerin gösterimi, ad + telefon ile talep),
satır 30 (müşteri randevu detay ekranı), satır 46 (Turnstile).

Uygulama indirmeden çalışan mobil web arayüzü.

- ✅ **Slot üreteci** (`src/lib/slots.ts`, saf fonksiyon) — fazın ön koşuluydu. Hesaba kattıkları:
  `WorkingHours`, `WorkingHoursException` (haftalık kaydı EZER), slot tutan mevcut randevular,
  `Service.durationMinutes`, geçmiş saatler, yaz saati geçişinde var olmayan duvar saatleri.
  Elenen durum listesi (`CANCELLED`, `EXPIRED`) EXCLUDE kısıtının predicate'iyle birebir aynı.
- ✅ `src/lib/timezone.ts` — mutlak an ↔ yerel duvar saati köprüsü. `availability.ts` 200 satır
  sınırını aştığı için ayrıldı (`mutlakAnHesapla`, `yerelAnHesapla`).
- ✅ `GET /api/businesses/[slug]` — işletme + hizmet listesi
- ✅ `GET /api/availability?businessId&serviceId&date` — o günün müsait saatleri
- ✅ `GET /api/appointments/token/[token]` — müşteri randevu detayı
- ✅ `/[businessSlug]` — hizmet → gün → saat → ad+telefon → Turnstile → POST /api/appointments,
  201 sonrası detay sayfasına yönlendirme
- ✅ `/[businessSlug]/appointment/[token]` — detay ekranı, altı randevu durumunun tamamı için
  ayrı görünüm + `publicToken` ile iptal (spec satır 42)
- ✅ `src/lib/read-limit.ts` — üç yeni public GET route'u için IP bazlı limit (CLAUDE.md §2).
  Upstash istemcisi `src/lib/redis.ts`'e çıkarıldı; `rate-limit.ts` onu kullanıyor.

Spec'te yazmayan, kullanıcı onayıyla alınan kararlar (2026-08-15): rezervasyon ufku bugün dahil
14 gün; slot adımı = hizmet süresi (arka arkaya, boşluksuz); saatler düz kronolojik ızgara
(gruplama yok); detay ekranında iptal butonu var; yeni API route'ları STRUCTURE.md'ye eklendi.

Doğrulama durumu: `npm run build` ve `npx eslint src` temiz. qa-tester beş başlığın tamamını
canlı Neon ve gerçek Chrome ile çalıştırdı, FAIL yok. Slot üretecinin durum bazlı davranışı
tek tek ölçüldü (PENDING/CONFIRMED/COMPLETED/NO_SHOW slotu tutar; CANCELLED/EXPIRED bırakır) ve
çakışan yazma `23P01` ile reddedildi. **Turnstile'ın RET dalı ilk kez gerçek tarayıcı token'ıyla
doğrulandı** (Cloudflare test anahtarlarıyla): 403 `TURNSTILE_FAILED`, randevu oluşmadı, widget
sıfırlandı. Faz 2 regresyonu (günlük 5 talep limiti, kota iadesinin negatife düşmemesi) korundu.

> Turnstile ULAŞILAMAMA (fail-open) dalı — 2026-08-15 tarihinde, geliştirme makinesindeki
> bir internet kesintisi sırasında KAZARA DOĞRULANDI. qa-tester bu dalı Cloudflare erişimini
> kasıtlı kesme yolu olmadığı için test edememişti. Sunucu logu:
>
> ```
> [turnstile] doğrulama çağrısı başarısız, kontrol ATLANIYOR (fail-open): TypeError: fetch failed
>     at async turnstileDogrula (src\lib\turnstile.ts:42:19)
> ```
>
> Yani Cloudflare'e ulaşılamadığında kontrol gerçekten ATLANIYOR, loglanıyor ve akış
> durmuyor — PROJECT_SPEC.md "Onaylanan Çıkarımlar" (2026-08-15) fail-open politikasının
> beklediği davranış. Doğrulamanın SINIRI: aynı kesintide Neon'a da ulaşılamadığı için
> (`P1001`) istek sonunda 500 döndü. Kanıtlanan şey "Turnstile kontrolü atlandı ve akış
> devam etti"dir; kesintisiz bir ortamda 201 ile bittiği AYRICA doğrulanmalı.
>
> Hâlâ test edilmemiş (tahmin üretilmedi): `read-limit.ts`'in dakikada 120 sınırı hiç
> tetiklenmedi. Faz 7 uçtan uca QA'da ele alınmalı.

## Faz 4 — Dashboard ✅ TAMAMLANDI

Spec dayanağı: satır 14-19 (hizmet ve çalışma saati yönetimi), satır 24 (bekleyen randevular),
satır 39 (her zaman görünür bekleyen sayısı rozeti), satır 48-49 (berber kimlik doğrulaması — UI katmanı).

- ✅ `/login`, `/register` — Faz 2 auth API'lerinin UI katmanı
- ✅ `/dashboard` + `layout.tsx` — bugünün randevuları; **bekleyen rozeti LAYOUT'ta** durur,
  böylece dört sekmede de görünür (spec satır 39 "her zaman görünür"). Sayaç liste yanıtının
  içinde (`pendingCount`) gelir; ayrı sayaç endpoint'i rozetin listeyle ayrışmasına yol açardı.
- ✅ `/dashboard/appointments` — dört kapsam (bekleyen/yaklaşan/bugün/tümü), onayla + iptal.
  Onay `wa.me` linkini YENİ SEKMEDE açar; mesaj MANUEL gönderilir (spec satır 28-29).
- ✅ `/dashboard/services` — hizmet CRUD + aktif/pasif
- ✅ `/dashboard/hours` — haftalık saatler (tek transaction, tam hafta) + istisna günleri
- ✅ 8 yeni oturum korumalı API route'u; `businessId` hiçbirinde istemciden alınmaz
- ✅ `DELETE /api/auth/session` (çıkış) — `sessionSilHeader()` Faz 2'den beri kullanılmıyordu

**Şema değişikliği:** `Service.isActive Boolean @default(true)`, migration
`20260816000000_add_service_is_active`. Gerekçe PROJECT_SPEC.md "Onaylanan Çıkarımlar"da
(2026-08-16 onaylı). Pasif hizmet public listede ve slot üretecinde görünmez; geçmiş
randevuları korunur. `Appointment_no_overlap_excl` kısıtının migration sonrası yerinde
kaldığı doğrulandı.

**Faz 2/3 arası kırık bağlantı düzeltildi:** `confirm` endpoint'i WhatsApp mesajına
`/r/<token>` koyuyordu ama öyle bir route hiç var olmadı — berberin müşteriye gönderdiği
link 404'tü. Artık `/[businessSlug]/appointment/[token]` üretiyor ve linkin açıldığı
tarayıcıda doğrulandı.

**Faz 2'den gelen gizli hata bulundu ve düzeltildi:** `register` route'u unique ihlalini
`meta.target` üzerinden okuyordu; Prisma 7 + adapter'da o alan YOK (alan adları
`meta.driverAdapterError.cause.constraint.fields` altında). Bu yüzden hem "e-posta zaten
kayıtlı" (409) hem de sonekli-slug yeniden denemesi ÖLÜ KODDU ve ikisi de 500 veriyordu.
`isSlotConflict` ile aynı sınıf hata; ortak `isUniqueViolation` yardımcısına çıkarıldı.
Ayrıca ikinci bir hata: catch içindeki yeniden deneme korumasızdı, aynı isim + aynı
e-posta kombinasyonunda e-posta ihlali dışarı kaçıyordu.

Doğrulama durumu: `npm run build` ve `npx eslint src` temiz. qa-tester sekiz başlığı canlı
Neon ve gerçek Chrome ile çalıştırdı; yetki izolasyonunda açık YOK (A işletmesi B'nin
hizmetine/randevusuna/istisnasına 404 veya 403 alıyor). Rozetin dört sekmede de göründüğü,
onay/iptal sonrası sayfa yenilenmeden güncellendiği ve sıfırda kaybolmadığı doğrulandı.

> **Faz 4 dashboard'u gerçek fare/dokunmatik girdisiyle henüz doğrulanmadı.** QA'da CDP
> senkron tıklama sorunu nedeniyle DOM click ile test edildi. React handler'ları aynı olduğu
> için fonksiyonel olarak geçerli sayıldı, ama gerçek cihaz testi Faz 7'ye (uçtan uca QA)
> taşınsın.

Auth tarafında hâlâ YAPILMAYANLAR (spec satır 49'da geçiyor, ayrı bir faza ait):
şifre sıfırlama, magic link alternatifi.

> **v2 adayı: şifremi unuttum akışı + login brute-force koruması birlikte ele alınacak —
> biri olmadan diğeri eksik/riskli kalıyor.** İkisi de v1'de BİLİNÇLİ olarak ertelendi
> (2026-08-16). Bugün `POST /api/auth/login` için rate limit/backoff YOK ve şifre sıfırlama
> akışı da YOK; bu ikisi tek bir işte ele alınmalıdır çünkü:
> - Brute-force koruması tek başına eklenirse, kilitlenen veya şifresini unutan berberin
>   kendi kendine kurtulma yolu olmaz (destek kanalı da yok).
> - Şifre sıfırlama tek başına eklenirse, sıfırlama e-postası saldırganın deneyebileceği
>   yeni bir yüzey açar ve giriş denemeleri hâlâ sınırsız kalır.

## Faz 5 — Push bildirimleri ✅ TAMAMLANDI

Spec dayanağı: satır 36-38. VAPID, Firebase yok, ücretsiz.

- ✅ `src/lib/push.ts` — VAPID gönderim katmanı. Push servisi **404/410** dönerse ilgili
  `PushSubscription` satırı SİLİNİR (ölü abonelikler yığılmaz); 429/5xx/ECONNREFUSED gibi
  GEÇİCİ hatalarda silinmez. Yeniden deneme YOK, 10 sn soket zaman aşımı, TTL 6 saat.
  Fonksiyon ASLA fırlatmaz — push yardımcı bir özelliktir, ana akışı bloklayamaz.
- ✅ `src/lib/push-notifications.ts` — yalnızca bildirim İÇERİĞİ (tek sorumluluk):
  - `yeniRandevuTalebiBildir(...)` — "Yeni randevu talebi" / "<ad>, <saat>". Randevu BUGÜNSE
    sadece saat, başka günse gün de yazılır ("17 Ağustos 09:00"), işletmenin saat diliminde.
  - `gunlukBekleyenOzetiGonder(businessId)` — spec satır 38'in fonksiyonu. PENDING sayar,
    "N bekleyen randevunuz var" gönderir; **N=0 ise hiç göndermez**. Faz 6'daki cron BUNU
    çağıracak; Faz 5'te hiçbir zamanlayıcı/cron kurulmadı (grep ile doğrulandı).
- ✅ `POST /api/appointments` — 201 sonrası `after()` (next/server) ile bildirim tetiklenir.
  Çıplak fire-and-forget DEĞİL: serverless'ta yanıttan sonra invocation dondurulur ve
  gönderim yarıda kalırdı. Push başarısız olsa da randevu **201 döner** ve hata loglanır.
- ✅ `public/sw.js` — service worker; `push` + `notificationclick` → `/dashboard/appointments?scope=pending`.
- ✅ `PushAcmaButonu` panel KABUĞUNDA — dört sekmede de. Abonelik varsa "Bildirimler açık"
  yazar; izin engellenmişse buton yerine açıklama gösterilir.

**Spec'te yazmayan, kullanıcı onaylı kararlar (2026-08-16):** `VAPID_SUBJECT` =
`mailto:akinc720@gmail.com`; gönderim hatasında yeniden deneme YOK (tek atış); bildirime
tıklanınca `/dashboard/appointments?scope=pending` açılır; bekleyen 0 iken günlük özet
gönderilmez; bildirim metninde bugün/başka gün ayrımı; buton kabukta sabit.

**QA'nın bulduğu ve düzeltilen tasarım hatası:** VAPID değişkenleri ilk halde
`serverEnv()`in monolitik şemasına eklenmişti; `prisma.ts` de `serverEnv()` çağırdığı için
**bozuk tek bir VAPID değeri veritabanı bağlantısını ve dolayısıyla randevu almayı komple
durduruyordu**. Ayrı bir `pushEnv()` şemasına çıkarıldı: artık bozuk push yapılandırması
yalnızca push'u bozar. Route seviyesinde ölçüldü — `VAPID_SUBJECT` geçersizken
`POST /api/appointments` **201** döndü, hata loglandı.

Doğrulama durumu: `npm run build` ve `npx eslint src` temiz. Gönderim yolu, yerel bir sahte
HTTPS push servisiyle GERÇEK `web-push` + gerçek VAPID JWT + gerçek aes128gcm şifrelemesi
üzerinden ölçüldü ve yük ÇÖZÜLEREK metin doğrulandı (TTL 21600, urgency high). 410 → satır
silindi; gerçek FCM'e sahte endpoint ile 404 dalı da doğrulandı; 10 sn zaman aşımı ölçüldü
(10.096 ms). İşletmeler arası izolasyon: A'ya gönderim B'nin aboneliğini hiç OKUMUYOR.
`VAPID_PRIVATE_KEY` panel HTML'lerinin hiçbirinde yok. Faz 2-4 regresyonu (14 endpoint,
rozet sayacı, `wa.me` linki, rastgele token) temiz.

**Tarayıcı zinciri GERÇEK FCM ile doğrulandı** (2026-08-16, kullanıcı Chrome'da bildirim
iznini verdikten sonra):

- ✅ Panelde "Bildirimleri Aç" butonu görünüyor; tıklayınca gerçek `pushManager.subscribe`
  çalışıyor ve gerçek bir FCM endpoint'i üretiliyor
  (`https://fcm.googleapis.com/fcm/send/crYV9DlBfOI:APA91bH…`), `p256dh`/`auth` dolu.
- ✅ `POST /api/push/subscribe` kaydı veritabanına yazıyor; buton "✓ Bildirimler açık" oluyor.
- ✅ Sunucudan Google'ın push servisine gerçek gönderim: `{toplam:1, basarili:1}`.
- ✅ **Bildirim ekranda göründü** ve metni beklenenle birebir eşleşti: başlık
  "Yeni randevu talebi", gövde "&lt;müşteri adı&gt;, &lt;saat&gt;" (kullanıcı gözlemi —
  Windows bildirim merkezi tarayıcı sekmesinin dışında olduğu için otomatik okunamıyor;
  `registration.getNotifications()` bu platformda SW bildirimlerini listelemiyor).
- ✅ **`tag`/`renotify` ezmesi**: aynı etiketle 3 sn arayla iki push → ekranda TEK bildirim,
  gövdesi ikinciyle güncellenmiş. Bildirim yığılması yok.
- ✅ **`notificationclick` yönlendirmesi**: tıklama `/dashboard/appointments?scope=pending`
  adresini açtı (sorgu parametresi dahil).

**Bu turda bulunan ve düzeltilen hata:** `notificationclick` içindeki
`WindowClient.navigate()` YALNIZCA service worker'ın KONTROL ETTİĞİ sekmelerde çalışır;
kontrolsüz bir sekmede `TypeError` ile reddedilir. Worker kaydedilmeden önce açılmış her
sekme ilk yenilemeye kadar kontrolsüzdür — yani ilk kurulumdan hemen sonraki tıklama
SESSİZCE hiçbir şey yapmıyordu. Reddediş artık yakalanıyor ve `clients.openWindow()`
yedeğine düşülüyor. İlk (düzeltme öncesi) tıklamada sekmenin `controller: false` olduğu
ölçüldü; düzeltmeden sonraki tıklama hedefe ulaştı.

> Ölçüm sınırı (dürüstlük notu): düzeltme sonrası tıklamada hedef adresin doğruluğu
> kullanıcı tarafından görüldü, ancak otomasyonun bağlı olduğu sekme `/dashboard`'da
> kaldı — yani hedef büyük olasılıkla `openWindow` yedeğiyle AYRI bir sekmede açıldı.
> "Mevcut sekmeyi yeniden kullanma" davranışının mı yoksa yedek yolun mu çalıştığı
> ÖLÇÜLMEDİ. İşlevsel sonuç (doğru adres açılıyor) her iki durumda da sağlanıyor.

## Faz 6 — Cron (zaman aşımı süpürmesi)

Spec dayanağı: satır 32-35. Sabit "2 saat" kuralı YOK; zaman aşımı işletmenin çalışma
saatlerine göre hesaplanır, kapalı saatlerde geçen süre sayılmaz.

`Business.timezone` + `WorkingHours` üzerinden hesaplama; süresi dolan randevular `EXPIRED`.

## Faz 7 — Uçtan uca QA

Spec dayanağı: `PROJECT_SPEC.md`'nin tamamı — tüm acceptance criteria.

Kapsam dışı maddelerin (satır 52-59) sızmadığının ve v2 maddelerinin (satır 61-66)
implement edilmediğinin doğrulanması dahil.

### Önceki fazlardan taşınan, henüz doğrulanmamış maddeler

Bunlar ilgili fazda TEST EDİLEMEDİ (tahmini sonuç üretilmedi) ve burada kapatılmalı:

- **Faz 4 — dashboard'un gerçek fare/dokunmatik girdisiyle testi.** QA'da CDP senkron
  tıklama sorunu nedeniyle DOM click ile test edildi; React handler'ları aynı olduğu için
  fonksiyonel olarak geçerli sayıldı, ancak gerçek cihaz girdisi doğrulanmadı.
- **Faz 3 — `read-limit.ts` dakikada 120 istek sınırı.** Hiç tetiklenmedi.
- **Faz 3 — Turnstile fail-open dalının kesintisiz ortamda 201 ile bitmesi.** Fail-open'ın
  tetiklendiği bir internet kesintisinde gözlendi, ama aynı kesintide Neon'a da
  ulaşılamadığı için istek 500 ile bitti; yalnızca "kontrol atlandı, akış devam etti"
  kanıtlandı.

## Faz 8 — İlk deploy

Vercel free tier (`CLAUDE.md` §1). Ortam değişkenleri, Neon bağlantısı, cron yapılandırması.
