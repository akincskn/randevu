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
satır 72-73 (slot çakışmasının veritabanı seviyesinde engellenmesi).

- Prisma 7 + Neon PostgreSQL kurulumu, `prisma.config.ts` (`DIRECT_URL` ile migration)
- 6 model: `Business`, `Service`, `WorkingHours`, `WorkingHoursException`,
  `Appointment`, `PushSubscription`
- `AppointmentStatus` enum — 6 değer (slot TUTAN / BIRAKAN ayrımı)
- `Appointment_no_overlap_excl` — `btree_gist` + `EXCLUDE USING gist`, aralık çakışması koruması
- `Service_durationMinutes_positive_check` — sıfır uzunluklu randevu boşluğunu kapatır
- Neon'a deploy edildi ve veritabanı üzerinden doğrulandı

## Faz 2 — API Routes + Minimal Auth (API-only, UI Faz 4'te) ✅ TAMAMLANDI

Spec dayanağı: satır 22-23 (randevu talebi oluşturma), satır 25-29 (onay + `wa.me` linki),
satır 70-75 (güvenlik: rastgele token, rate limiting, bot doğrulaması), satır 65-67 (push aboneliği),
**satır 77-78 (berber kimlik doğrulaması — yalnızca API katmanı)**.

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
satır 30 (müşteri randevu detay ekranı), satır 75 (Turnstile).

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
  ayrı görünüm + `publicToken` ile iptal (spec satır 71)
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
satır 68 (her zaman görünür bekleyen sayısı rozeti), satır 77-78 (berber kimlik doğrulaması — UI katmanı).

- ✅ `/login`, `/register` — Faz 2 auth API'lerinin UI katmanı
- ✅ `/dashboard` + `layout.tsx` — bugünün randevuları; **bekleyen rozeti LAYOUT'ta** durur,
  böylece dört sekmede de görünür (spec satır 68 "her zaman görünür"). Sayaç liste yanıtının
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

Auth tarafında hâlâ YAPILMAYANLAR (spec satır 78'de geçiyor, ayrı bir faza ait):
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

Spec dayanağı: satır 65-67. VAPID, Firebase yok, ücretsiz.

- ✅ `src/lib/push.ts` — VAPID gönderim katmanı. Push servisi **404/410** dönerse ilgili
  `PushSubscription` satırı SİLİNİR (ölü abonelikler yığılmaz); 429/5xx/ECONNREFUSED gibi
  GEÇİCİ hatalarda silinmez. Yeniden deneme YOK, 10 sn soket zaman aşımı, TTL 6 saat.
  Fonksiyon ASLA fırlatmaz — push yardımcı bir özelliktir, ana akışı bloklayamaz.
- ✅ `src/lib/push-notifications.ts` — yalnızca bildirim İÇERİĞİ (tek sorumluluk):
  - `yeniRandevuTalebiBildir(...)` — "Yeni randevu talebi" / "<ad>, <saat>". Randevu BUGÜNSE
    sadece saat, başka günse gün de yazılır ("17 Ağustos 09:00"), işletmenin saat diliminde.
  - `gunlukBekleyenOzetiGonder(businessId)` — spec satır 67'in fonksiyonu. PENDING sayar,
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

## Faz 6 — Cron (zaman aşımı süpürmesi) ✅ TAMAMLANDI ⚠ bağımsız QA bekliyor (session limiti nedeniyle geliştirici kendi kodunu test etti)

Spec dayanağı: satır 61-64 (çalışma saati farkındalıklı zaman aşımı) ve satır 67 (günlük özet).
Sabit "2 saat" kuralı YOK; kapalı saatlerde geçen süre sayılmaz.

- ✅ `src/lib/expiry.ts` — SAF hesap (`slots.ts` ile aynı gerekçe: veritabanına dokunmaz).
  `createdAt`'ten itibaren yalnızca AÇIK dakikalar birikir, 120'ye ulaşınca randevu düşer;
  kapalıyken sayaç durur, ertesi açılışta devam eder. Birikim duvar saati farkıyla değil
  MUTLAK zaman farkıyla ölçülür — yaz saati geçişinde 09:00-18:00 açık bir gün gerçekte
  9 değil 8 saattir.
- ✅ `src/lib/expiry-sweep.ts` — okuma → `updateMany` ile EXPIRED → günlük özet. Özet
  güncellemeden SONRA gönderilir, böylece "N bekleyen" sayısı az önce düşenleri içermez.
- ✅ `src/lib/digest-lock.ts` — `digest:<businessId>:<yerelGün>` (SET NX, 26 sa TTL).
  Redis'e ulaşılamazsa FAIL-OPEN (kullanıcı kararı).
- ✅ `src/lib/cron-auth.ts` + `cronEnv()` — `Authorization: Bearer <CRON_SECRET>`,
  `timingSafeEqual`. `pushEnv()` ile aynı gerekçeyle AYRI şema.
- ✅ `POST /api/cron/expire-appointments` — 34 satır, yalnızca kimlik doğrulayıp süpürmeyi
  çağırır. GET YOK: tarayıcıda kazara açılan bir adres randevu durumu değiştirmemeli.

**Spec'te yazmayan, kullanıcı onaylı kararlar (2026-08-16):** bütçe 120 dk ve açık dakikalar
birikir; `startsAt` geçtiyse bütçe dolmasa da EXPIRED; `expiresAt` kolonu EKLENMEDİ (hesap
süpürme anında yapılır, böylece berber saatlerini sonradan değiştirince eskimez); zamanlayıcı
Upstash QStash 15 dk (Vercel Cron ücretsiz planda günde 1 tetikleme verdiği için elendi);
günlük özet = açılış penceresi + Redis NX kilidi. Gerekçeler PROJECT_SPEC.md
"Onaylanan Çıkarımlar"da.

**Uygulama sırasında seçilen iki parametre (spec'te yok, kullanıcıya bildirildi):**
`OZET_PENCERESI_DAKIKA = 30` — cron aralığından geniş tutuldu ki tek tur kaçırıldığında
o günün özeti tamamen düşmesin; mükerrerliği kilit engelliyor. `MAX_GUN = 400` — birikim
döngüsünde sonsuz döngü koruması; sınıra ulaşılırsa randevu "dolmamış" sayılır (fail-safe),
çünkü her günü kapalı bir işletmede sayaç gerçekten ilerlemez.

Doğrulama durumu: `npm run build` ve `npx eslint src` temiz.

> **QA ajanı hesap oturum limitine takıldı; doğrulamayı ana oturum kendisi yaptı.**
> Bu, ayrı bir QA gözünün eksik olduğu anlamına gelir — Faz 7'de bağımsız olarak
> tekrarlanmalı.

Saf hesap katmanı 19 senaryoyla ölçüldü (gece talebi, akşam talebinin ertesi güne taşması,
kapalı Pazar, istisna günü, `startsAt` dalı, MAX_GUN uyarısı). Süpürme CANLI Neon + CANLI
Upstash üzerinde 28 doğrulamayla ölçüldü:

- Gece 02:00 talebi 09:00 açılışlı dükkanda 10:59'da PENDING, **11:00'da EXPIRED**.
- Cumartesi 17:30 talebi Pazar (kapalı) boyunca ilerlemedi, **Pazartesi 10:30'da** düştü.
- `startsAt` geçmiş ama bütçesi dolmamış randevu EXPIRED oldu (kural 2).
- CONFIRMED / CANCELLED / COMPLETED / NO_SHOW randevulara DOKUNULMADI.
- İzolasyon: 12:00 açan B işletmesinin randevusu, 09:00 açan A'nın takvimine göre DEĞİL
  kendi takvimine göre değerlendirildi (11:00'da PENDING, 14:00'te EXPIRED).
- **EXCLUDE kısıtı ölçüldü:** EXPIRED randevunun saatine yeni kayıt YAZILABİLDİ; karşı
  kontrolde CONFIRMED randevunun saati hâlâ REDDEDİLDİ.
- Günlük özet: pencere içinde gönderildi, pencere dışında gönderilmedi, aynı gün ikinci
  turda Redis kilidi engelledi, farklı gün kilidi serbest kaldı.
- Bozuk `timezone` ("Mars/Olympus") olan işletme süpürmeyi ÇÖKERTMEDİ; hata loglandı,
  diğer işletme işlenmeye devam etti.
- Yetkilendirme (gerçek HTTP, 7/7): başlıksız / yanlış / tek karakter bozuk / kısa /
  `Bearer` öneksiz istekler **401**; GET **405**; doğru secret **200**. Farklı uzunlukta
  secret 500 değil 401 verdi (`timingSafeEqual` uzunluk koruması).
- **Faz 5 dersinin tekrarlanmadığı ölçüldü:** `CRON_SECRET` ortamdan KALDIRILDIĞINDA
  `serverEnv()` ve veritabanı sorgusu çalışmaya devam etti, yalnızca `cronEnv()` fırladı.

**Gerçek tarayıcı (Playwright, localhost:3000):** panelde iki bekleyen randevu varken rozet
**2** gösterdi; cron çağrısından sonra rozet **1**'e düştü, süresi dolan randevu bekleyen
listesinden çıktı, taze randevu korundu. Müşteri detay ekranı (`/[slug]/appointment/[token]`)
**"Talebin süresi doldu"** görünümünü verdi.

> **Ölçülmeyen (dürüstlük notu):** günlük özetin GERÇEK bir push servisine ulaşması bu fazda
> test EDİLMEDİ — sahte abonelik endpoint'i (bağlantı reddi) kullanıldı, çünkü ölçülmek
> istenen ZAMANLAMA kararıydı. Gerçek FCM teslimatı Faz 5'te doğrulanmıştı.
> **QStash zamanlaması HENÜZ KAYDEDİLMEDİ** — Faz 8 (deploy) işidir, aşağıya bakın.

### Faz 8'e devredilen kurulum

Cron kodu hazır ama hiçbir yerde ZAMANLANMADI. Deploy sırasında yapılacaklar:

1. Vercel ortam değişkenlerine `CRON_SECRET` eklenir (min 32 karakter, kriptografik rastgele):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. QStash'te 15 dakikalık zamanlama kaydedilir:
   ```
   curl -X POST https://qstash.upstash.io/v2/schedules/https://<alan-adi>/api/cron/expire-appointments \
     -H "Authorization: Bearer $QSTASH_TOKEN" \
     -H "Upstash-Cron: */15 * * * *" \
     -H "Upstash-Forward-Authorization: Bearer $CRON_SECRET"
   ```
   (`Upstash-Forward-*` başlıkları hedefe `Authorization` olarak iletilir.)
3. İlk turdan sonra Vercel loglarında `[cron] zaman aşımı süpürmesi tamamlandı` satırı
   ve sayaçlar doğrulanır.

## Faz 7 — Uçtan uca QA ✅ TAMAMLANDI

Spec dayanağı: `PROJECT_SPEC.md`'nin tamamı — tüm acceptance criteria.

Bağımsız `qa-tester` oturumu, canlı Neon + canlı Upstash + gerçek Chrome (Playwright) ile
~100 başlık koşturdu. **KOD KUSURU BULUNMADI (0 FAIL).** 3 madde TEST EDİLEMEDİ (aşağıda).
`npm run build`, `npx eslint src`, `npx tsc --noEmit` temiz.

**Faz 6 bağımsız olarak yeniden doğrulandı (46 başlık)** — geliştiricinin ölçümleri kanıt
sayılmadı, hepsi sıfırdan tekrar çalıştırıldı:

- Zaman aşımı birikimi dakika hassasiyetinde: gece 02:00 talebi 07:59Z PENDING / 08:00Z
  EXPIRED; Cumartesi 17:30 talebi Pazar (kapalı) boyunca ilerlemedi, Pazartesi 07:29Z
  PENDING / 07:30Z EXPIRED. Çalışma saati İSTİSNASI olan üç günlük zincir de ölçüldü.
- `startsAt` önceliği KONTROLLÜ doğrulandı: aynı `createdAt`, uzak `startsAt` → PENDING
  kaldı; yani randevuyu düşüren şey gerçekten `startsAt`.
- İşletmeler arası izolasyon: A düşerken B kendi 12:00 açılışına göre 3 saat sonra düştü.
- EXCLUDE kısıtı İKİ YÖNLÜ: EXPIRED'ın saati yazılabildi, CONFIRMED'ınki `23P01`
  `conflicting key value violates exclusion constraint "Appointment_no_overlap_excl"` ile
  reddedildi.
- Günlük özet 10/10: gerçek TLS push alıcısıyla ölçüldü — "gönderim kararı verildi" değil,
  240 baytlık aes128gcm gövdenin TESLİM EDİLDİĞİ. Pencere sınırı açılış+29 dk İÇERİDE /
  +30 dk DIŞARIDA. NX kilidi aynı yerel günde engelledi, farklı günde serbest bıraktı,
  Upstash'te TTL=93599 sn ile gerçekten oluştu. Özetin süpürmeden SONRA gittiği, alıcının
  push anında veritabanını sorgulamasıyla kanıtlandı (sayı 2 değil 1 idi).
- Cron yetkilendirmesi 12/12: 8 farklı geçersiz biçim → 401; GET → 405; doğru secret → 200.
  Farklı uzunlukta secret 500 değil 401. **Mutasyon kanıtı:** 401 alan istekler DB'yi
  değiştirmedi, ardından yetkili istek AYNI randevuyu düşürdü — yani randevu gerçekten
  düşmeye hazırdı, onu koruyan şey 401'lerdi.
- `cronEnv()` izolasyonu 4/4: `CRON_SECRET` ortamdan tamamen kaldırıldığında `serverEnv()`,
  `pushEnv()` ve `prisma.business.count()` çalışmaya devam etti; yalnızca `cronEnv()`
  fırlattı. Faz 5'in VAPID dersi TEKRARLANMAMIŞ.

**Taşınan dört maddenin hepsi kapandı:**

- **Faz 4 — gerçek pointer/klavye girdisi:** 13 etkileşimin tamamı gerçek Playwright
  olaylarıyla çalıştı (kayıt, 4 sekme geçişi, hizmet ekle/pasifleştir/aktifleştir/düzenle,
  haftalık saat kaydetme, istisna ekle/kaldır, onayla → `wa.me` yeni sekmede + rozet 3→2,
  iptal → rozet 1→0, çıkış). **Gerçek girdiyle çalışmayan etkileşim bulunmadı.**
- **Faz 3 — `read-limit.ts` 120/dk İLK KEZ TETİKLENDİ:** üç public GET route'unun HER
  BİRİNDE 121. istek `429 RATE_LIMITED` döndü, ilk 120 istek 200. (İlk deneme yanıltıcı
  negatif verdi: 126 istek sıralı atılınca 60 sn'lik sabit pencere sıfırlanıyor; pencere
  başına hizalanıp paralel gruplarla tekrar ölçüldü.)
- **Faz 3 — Turnstile fail-open KESİNTİSİZ ortamda 201:** doğrulama URL'si geçici olarak
  cevapsız bir adrese çevrildi (yama raporlandı ve `git checkout` ile geri alındı, commit
  EDİLMEDİ). Yama öncesi aynı geçersiz token 403, yama sonrası **201 + randevu oluştu**.
  Neon sağlıklıydı; Faz 3'teki "aynı kesintide 500 ile bitti" sınırı aşıldı.
- **Faz 6 — günlük özetin gerçek push servisine teslimatı:** Faz 5'ten kalan canlı FCM
  aboneliğiyle `{toplam:1, basarili:1, silinen:0, basarisiz:0}` — Google'ın push servisi
  KABUL ETTİ. (Ekranda görülmesi hariç, bkz. aşağıdaki (1).)

**Spec taraması:** v1 kapsamındaki 21 maddenin tamamı satır referanslı doğrulandı; eşzamanlı
4 istekle slot çakışması TAM 1×201 / 3×409 verdi, telefon kotası 6. istekte 429'a düştü,
token'lar 43 karakter `base64url` ve ardışık üretimde ilişkisiz. Daha önce hiç QA edilmemiş
köşeler de tarandı: boş durum ekranları, geçersiz token, yetki izolasyonu (404/403), sunucu
tarafı doğrulama dalları, 390px mobil düzende yatay taşma yok, konsol temiz.

**Kapsam dışı sızıntı kontrolü TEMİZ:** AI/LLM, WhatsApp Business API, ödeme, SMS,
kasa/adisyon, reklam, owner/staff — hiçbiri `package.json`'da veya `src/`'de yok. `wa.me`
yalnızca URL üretiyor, dış servise çağrı yapmıyor (spec 27-29 gereği kapsam İÇİ).

### TEST EDİLEMEDİ (3) — Faz 8'de kapatılmalı

1. **Günlük özet bildiriminin EKRANDA görülmesi.** Sunucudan gerçek FCM'e teslimat
   kanıtlandı ama Windows bildirim merkezi tarayıcı sekmesinin dışında ve
   `registration.getNotifications()` bu platformda SW bildirimlerini listelemiyor.
   Beklenen metin: başlık "Bekleyen randevular", gövde "N bekleyen randevunuz var".
   Kullanıcının gözle teyidi gerekiyor.
2. **QStash zamanlamasının kaydı ve ilk turun canlı logu.** Faz 8 işi.
3. **"Yeni randevu talebi" push'unun bu oturumda yeniden ölçümü.** Tarayıcıdan randevu
   alınan test işletmesinin aboneliği yoktu, `after()` no-op'a düştü. Aynı taşıma katmanı
   özet üzerinden gerçek FCM'e karşı ölçüldü; bu bildirim Faz 5'te zaten doğrulanmıştı.

### Faz 7 gözlemleri ve karara bağlanan sonuçları (2026-08-16)

QA altı gözlem bildirdi, hiçbiri FAIL değildi. Kullanıcı **(a) ve (d)'nin düzeltilmesine,
(b) (c) (e) (f)'ye DOKUNULMAMASINA** karar verdi. Gerekçeler burada kayıtlı ki ileride
tekrar sorulmasın — bunlar açık iş DEĞİL, KAPANMIŞ kararlardır.

- **(a) DÜZELTİLDİ.** Var olmayan slug HTTP 200 dönüyordu. `[businessSlug]/page.tsx` artık
  sunucu tarafında public API'ye sorup işletme yoksa `notFound()` çağırıyor; Türkçe
  `src/app/not-found.tsx` eklendi (aksi halde Next.js'in İngilizce varsayılan 404'ü
  görünürdü). API'ye ULAŞILAMADIĞINDA 404 verilmez — geçici bir kesinti kalıcı bir
  "dükkan yok" mesajına dönüşmemeli (Turnstile/Upstash fail-open politikasıyla aynı yön).
- **(b) DOKUNULMAYACAK — kapandı.** Detay sayfasında `[businessSlug]` segmenti
  doğrulanmıyor; başka işletmenin slug'ı ile geçerli token çalışıyor. Güvenlik açığı
  DEĞİLDİR: yetki token'ın kendisidir (spec satır 71), token tahmin edilemez ve ekranda
  randevunun GERÇEK sahibi işletmenin adı yazar. Slug burada yalnızca bir URL süsü.
- **(c) DOKUNULMAYACAK — kapandı.** Panel sekme değişimi URL'e yansımıyor, yenilemede
  seçili sekme kayboluyor. Kozmetik; spec sekme durumunun kalıcılığını istemiyor.
- **(d) DÜZELTİLDİ.** "Create Next App" kalıntısı kaldırıldı: kök `metadata` gerçek başlık
  + Türkçe açıklama, `%s · Randevu` şablonu, `<html lang>` `en` → `tr`, yedi sayfaya kendi
  başlığı, public booking sayfasına İŞLETMENİN adı. Randevu detay sayfası bilinçli olarak
  STATİK "Randevu detayı" başlığı taşır — müşteri adı/saati başlığa (ve tarayıcı
  geçmişine) sızmasın diye.
- **(e) DOKUNULMAYACAK — kapandı.** `read-limit`, `x-forwarded-for` başlığı yokken
  uygulanmıyor. Kodda bilinçli ve yorumlanmış: Vercel arkasında bu başlık DAİMA vardır,
  başlıksız istek yalnızca doğrudan sunucuya erişimde (yerel geliştirme) olur. Limitin
  bugüne kadar hiç tetiklenmemiş olmasının sebebi buydu.
- **(f) BİZİM HATAMIZ DEĞİL — kapandı.** WhatsApp mesajındaki bozuk emoji. Sunucunun
  ürettiği link bayt düzeyinde doğru (`%F0%9F%93%85`, `%E2%9C%82%EF%B8%8F` ölçüldü);
  bozulma `wa.me` → `api.whatsapp.com` yönlendirmesinde WhatsApp tarafında oluşuyor.
  Bizim tarafımızda yapılacak bir şey yok.

### (a) ve (d) düzeltmelerinin QA'sı (2026-08-17)

Düzeltmeler `qa-metadata` tarafından 24 başlıkta test edildi: **21 PASS / 2 FAIL /
1 TEST EDİLEMEDİ.** İki FAIL de düzeltmelerin kendisinden çıktı ve ele alındı.

**FAIL 2 — DÜZELTİLDİ.** Var olmayan slug sayfasının başlığı sunucu HTML'inde
"Sayfa bulunamadı", hydration sonrası "İşletme bulunamadı" oluyordu; iki kaynak iki
farklı metin veriyordu. `generateMetadata` artık ÜÇ durumu ayırıyor: `var` → işletme
adı, `yok` → `not-found.tsx` ile aynı sabit (`BULUNAMADI_BASLIGI`, tek yerden
paylaşılıyor), `bilinmiyor` → başlık vermez, kök varsayılan miras alınır. Üçüncü dal
QA'nın ayrıca bildirdiği gözlemi de kapattı: API kesintisinde çalışan bir randevu
ekranının üstünde "İşletme bulunamadı" yazmıyor artık.

**FAIL 1 — KABUL EDİLEN SINIR, DÜZELTME GİRİŞİMİ YAPILMAYACAK.**
`notFound()` render'ı Next.js 16.3.1'de root layout dışında oluşuyor (framework
davranışı, üç ayrı yöntemle doğrulandı, proje kodundan kaynaklanmıyor). Etkisi:
yalnızca var olmayan işletme linkine gidildiğinde, hydration tamamlanana kadar ilk
HTML'de lang/font sınıfı eksik. Hydration sonrası düzeliyor. Kabul edilen sınır,
düzeltme girişimi yapılmayacak.

> Doğrulama yöntemi (ileride aynı yol tekrar denenmesin diye): `(public)` route
> grubuna `not-found.tsx` eklendi → değişmedi; `[businessSlug]` segmentine eklendi →
> değişmedi; metadata/fetch/route grubu içermeyen, yalnızca `notFound()` çağıran boş
> bir test route'u → aynı `<html id="__next_error__">` çıktısı. Faydasız olduğu
> kanıtlanan kopyalar silindi. EŞLEŞMEYEN URL'lerin 404'ü (ör. `/a/b/c`) bu durumdan
> ETKİLENMİYOR, kök layout'u ve `lang="tr"` alıyor.

**TEST EDİLEMEDİ:** prod'da istemci tarafı istek sayısı — `next start` çalışan dev
sunucusuyla aynı `.next` dizinini paylaştığı için chunk'lar 500 döndü. Sunucu tarafı
ölçüm etkilenmedi.

**Ölçüm (kusur değil):** sunucu tarafı varlık kontrolü sayfa başına TAM 1 ek istek
getiriyor — `cache()` sarmalayıcısı `generateMetadata` + sayfa çiftini gerçekten
tekilleştiriyor. Dev'de istemci ayrıca 2 istek atıyor (React StrictMode çift-effect).

**SON TUR QA (2026-08-17) — 23/23 PASS, FAIL YOK.** Bağımsız `qa-son-tur` oturumu
düzeltmeleri yeniden ölçtü:

- Başlık kayması yeniden ÜRETİLEMEDİ: olmayan slug için ham HTML `<title>` ile
  tarayıcıda hydration sonrası `document.title` **birebir aynı** ("Sayfa bulunamadı ·
  Randevu"). `/demo-berber` başlığı da hydration sonrası değişmiyor.
- Fail-open dalı stub sunucuyla GERÇEKTEN tetiklendi (stub logu iki isteği de kaydetti):
  HTTP 200 + kök varsayılan başlık. Eski "İşletme bulunamadı" başlığı gitmiş.
- Kabul edilen sınır teyit edildi: olmayan slug 404, gövde Türkçe, hydration sonrası
  `documentElement.lang` = "tr" ve `id` boşalıyor. Eşleşmeyen URL 404'ünde REGRESYON YOK.
- Silinen 5 SVG'nin hepsi HTTP 404; uygulama kodunda referans yok; gerçek tarayıcıda
  8 sayfada tek bir asset 404'ü veya kırık görsel yok. `.playwright-mcp/` ignore ediliyor.
- Dar regresyon temiz: build/eslint/tsc, kök sayfa bağlantıları, `/demo-berber` booking
  akışı (3 hizmet → 14 gün → 14 slot), panel giriş/sekmeler/çıkış, müşteri detay sayfası.

> QA `next build`'i repo İÇİNDE çalıştırmadı: `next build` ile `next dev` aynı `.next`
> dizinini paylaştığı için kullanıcının dev sunucusunu bozmamak adına repo'nun repo
> dışına alınmış bir kopyasında derledi.

**QA'nın bildirdiği, bu turun kapsamı DIŞINDA kalan gözlem:** geçersiz `publicToken` ile
randevu detay sayfası HTTP **200** dönüyor (gövdede istemci tarafı "Randevu bulunamadı."
uyarısı çıkıyor), yani olmayan slug için seçilen 404 yaklaşımından farklı davranıyor.
Karara bağlanmadı — kullanıcıya sorulmalı.

### Faz 7'de ORTAYA ÇIKAN, karara bağlanan madde

- **Kök `/` sayfası — YAZILDI (2026-08-17).** `src/app/page.tsx` create-next-app'in
  İngilizce şablonuydu (Next.js logosu, "To get started, edit the page.tsx file.",
  Vercel/Next.js pazarlama linkleri). QA'nın altı gözleminde YOKTU — spec'te kök sayfa
  tanımlı olmadığı için tarama kapsamına girmemişti; (d) düzeltilirken fark edildi.
  `PROJECT_SPEC.md` bir tanıtım sayfası TANIMLAMIYOR, bu yüzden içeriği tahmin edilmedi
  ve kullanıcıya soruldu. Onaylanan kapsam BİLİNÇLİ OLARAK DAR: başlık + tek cümle +
  "Ücretsiz Kayıt Ol" (`/register`) + "Giriş Yap" (`/login`). Hero görsel, özellik
  listesi, fiyatlandırma KASITEN YOK — spec'te olmayan bir pazarlama yüzeyi
  büyütülmeyecek. Hedef kitle BERBERDİR; müşteriler buraya değil işletmenin kendi
  linkine gelir (spec satır 22).
- **create-next-app kalıntısı olan 5 SVG silindi** (`next.svg`, `vercel.svg`, `file.svg`,
  `globe.svg`, `window.svg`) — beşi de referanssızdı, önce `grep` ile doğrulandı.
  `public/` içinde artık yalnızca `sw.js` var (Faz 5 service worker'ı).
- **`.gitignore`'a `.playwright-mcp/` eklendi.** Her Playwright MCP oturumu repo köküne
  snapshot/console/screenshot dosyaları bırakıyor ve `git status`'ü kirletiyordu.

> **v1 canlıya çıkarken bilinen ve KASITLI risk:** login brute-force koruması ve şifre
> sıfırlama YOK (2026-08-16'da birlikte v2'ye ertelendi). QA `POST /api/auth/login`'in
> bugün sınırsız denemeye açık olduğunu ölçtü. FAIL sayılmadı çünkü bilinçli bir karar,
> ama canlıda duran bir risktir.

## Faz 8 — İlk deploy ✅ TAMAMLANDI (2026-08-17)

Vercel free tier (`CLAUDE.md` §1). Ortam değişkenleri, Neon bağlantısı, cron yapılandırması.

**Canlı adres:** https://randevu-five.vercel.app
(alias'lar: `randevu-akincskns-projects.vercel.app`, `randevu-git-main-akincskns-projects.vercel.app`)

### Deploy sırasında çıkan ve düzeltilen kusurlar

1. **Build tip kontrolünde 31 hatayla düştü** — Prisma 7 kurulumda Client'ı artık
   kendiliğinden üretmiyor, temiz CI kurulumunda `@prisma/client` hiçbir tip export
   etmiyordu (`has no exported member 'PrismaClient' / 'Appointment' / 'WorkingHours'`).
   Yerelde `node_modules`'daki üretilmiş client yüzünden görünmüyordu.
   Düzeltme: `build` script'i `prisma generate && next build`. `postinstall` DEĞİL —
   Vercel node_modules cache'i isabet ettiğinde postinstall atlanır, build adımı atlanmaz.
2. **Onay mesajındaki emojiler `�` oluyordu** — `wa.me` isteği 302 ile `api.whatsapp.com`'a
   yönlendirirken `text` parametresindeki BMP dışı karakterleri U+FFFD'ye çeviriyor
   (`?text=%F0%9F%93%85` -> `Location: ...&text=%EF%BF%BD`). Kaynak dosyanın baytları
   doğru UTF-8'di. Düzeltme: link doğrudan `api.whatsapp.com/send/` üretiyor (yönlendirme
   yok, 200). Gerekçe `PROJECT_SPEC.md` "Onaylanan Çıkarımlar"a kaydedildi.

### Deploy dışı yapılandırma engelleri (kod kusuru değil)

- **Vercel Deployment Protection** production'da açıktı, her istek SSO'ya 302 atıyordu —
  müşteri sayfası da cron endpoint'i de erişilemezdi. Kullanıcı kapattı.
- **Cloudflare Turnstile** production hostname'lerini tanımıyordu (`Error: 110200`,
  domain not allowed). Gönderim butonu KİLİTLİ kaldı — bu spec'in 2026-08-15 kararının
  doğru davranışı (istemci tarafı fail-open YOK). Kullanıcı hostname'leri ekledi.

### Uçtan uca smoke test (gerçek production, gerçek tarayıcı)

Public sayfa -> hizmet/gün/saat seçimi -> Turnstile -> randevu talebi -> panelde rozet ->
onay -> WhatsApp linki -> müşteri detay ekranı zincirinin tamamı koşturuldu:

- Turnstile "Başarılı!", talep `PENDING` oluştu, `publicToken` 43 karakter rastgele.
- Geçmiş saat filtresi canlıda ölçüldü: saat ~16:0x iken slot listesi 16:20'den başladı.
- Panelde "1 randevu onayınızı bekliyor" rozeti; onay sonrası 0'a düştü, satır "Onaylandı".
- Veritabanında `status: CONFIRMED`, `startsAt` doğru (15:20Z = 18:20 Europe/Istanbul).
- **`whatsappUrl` production domain'ini taşıyor, `localhost` DEĞİL** —
  `NEXT_PUBLIC_APP_URL` girilmemiş olmasına rağmen `request.nextUrl.origin` fallback'i
  doğru çalışıyor.
- Mesajdaki detay linki gerçekten açıldı: "Randevunuz onaylandı" ekranı geldi.
- İkinci randevu alınırken 18:20 slotu listede YOKTU — `Appointment_no_overlap_excl`
  canlıda da slotu tutuyor.
- Tarayıcı konsolunda hata yok.

### QStash zamanlaması ✅

`*/15 * * * *` -> `POST https://randevu-five.vercel.app/api/cron/expire-appointments`,
`Upstash-Forward-Authorization: Bearer <CRON_SECRET>` ile. **17:00 turu Upstash konsolunda
"Delivered", 3 sn, hata yok** (kullanıcı doğrudan gözlemledi). Sırsız POST'un 401
`{"code":"UNAUTHORIZED"}` döndüğü ayrıca ölçüldü — koruma çalışıyor.

Not: `vercel logs` CLI'ı bu projede güvenilir değil (bilinen 4+ istekten yalnızca 1'ini
gösterdi ve 5 dakikada kendini kesiyor). Cron doğrulaması bu yüzden Upstash konsolundan
yapıldı; ileride runtime log kontrolü için Vercel dashboard Observability kullanılmalı.

### Emoji encoding doğrulamasının sınırı — bilinen ve kabul edilen

Emoji encoding, URL/bayt seviyesinde iki ayrı yöntemle doğrulandı (HTML analizi +
production round-trip). WhatsApp'ın kendi önizleme sayfasındaki görsel render kaybı
(WhatsApp'ın kontrolü dışında, url encoding'i etkilemiyor) bilinen ve kabul edilen bir
sınır — gerçek mesaj kutusunda göz ile doğrulanmadı, deploy'u bloke etmiyor.

### Faz 7'den devredilen 3 maddenin durumu

1. Günlük özet bildiriminin EKRANDA görülmesi — hâlâ göz ile teyit edilmedi (v1'i bloke
   etmiyor; sunucudan gerçek FCM'e teslimat Faz 7'de ölçülmüştü).
2. QStash zamanlamasının kaydı ve ilk turun canlı logu — ✅ KAPANDI (yukarıda).
3. "Yeni randevu talebi" push'unun yeniden ölçümü — hâlâ ölçülmedi; test işletmesinin
   push aboneliği yok, `after()` no-op'a düşüyor. Faz 5'te doğrulanmıştı.

## Faz 9 — Manuel randevu ekleme (v1 kapsamına SONRADAN eklendi, 2026-08-19)

**Bu özellik PROJECT_SPEC.md'nin ilk sürümünde YOKTU.** Faz 1-8 boyunca uygulanan kapsam
kapalıydı; kullanıcı 2026-08-19'da yeni bir gereksinim olarak ekledi ve spec'in "Randevu akışı"
bölümüne **madde 5** olarak, "Onaylanan Çıkarım" değil **kapsam eklentisi** olarak işlendi
(spec'te ayrıca "Kapsam Eklentileri" başlığı açıldı — sonradan türetilen kararlarla
karıştırılmasın diye).

Gereksinim: berber, dükkana gelen veya telefonla arayan müşteriyi panelden elle randevu
defterine yazabilmeli.

### Yapılanlar

- `POST /api/appointments/manual` (YENİ) — oturumla korunur, `businessId` session'dan gelir.
  Turnstile YOK, rate limit YOK (ikisi de müşteri kötüye kullanımına karşıdır).
- Kayıt doğrudan `CONFIRMED` doğar. Yan etki bilinçli: bekleyen rozetini şişirmez ve
  zaman aşımı süpürmesi (yalnızca `PENDING` kayıtlara bakar) bu randevulara dokunmaz.
- **Çalışma saati / istisna kontrolü BİLİNÇLİ OLARAK bypass edildi** — hem route yorumunda
  hem spec madde 5'te açıkça böyle işaretli, sessiz bir tutarsızlık olarak bırakılmadı.
  Public `POST /api/appointments` kontrolü aynen duruyor.
- Bypass EDİLMEYENLER: `Appointment_no_overlap_excl` (çakışmada 409 SLOT_TAKEN), geçmiş saat
  engeli, `isActive: true` hizmet filtresi, kriptografik `publicToken`.
- `src/lib/appointment-links.ts` (YENİ) — müşteri detay linki üretimi confirm route'undan
  çıkarılıp paylaşılan bir modüle alındı. Gerekçe DRY değil, geçmiş bir hata: Faz 3'te link
  ile gerçek route ayrışmış ve WhatsApp'tan gönderilen adres 404 vermişti; iki üretim yeri
  olması aynı hatayı tekrarlamaya davetti.
- Panel: Randevular sekmesine "+ Yeni Randevu Ekle" butonu ve form
  (`manual-appointment-form.tsx` + `manual-appointment-fields.tsx` — tek dosya 219 satıra
  çıktığı için CLAUDE.md §2'nin 200 satır sınırı gereği ikiye bölündü).
- Saat SERBEST seçilir, availability slotlarıyla sınırlı değildir — çalışma saati bypass'ı
  ancak böyle kullanılabilir hale gelir.
- Oluşturma sonrası OPSİYONEL "WhatsApp'tan onay gönder" butonu; mevcut `onayWhatsappLinki`
  üreticisinin aynısını kullanır (mesaj yine MANUEL gönderilir).
- `/api/auth/session` yanıtına `timezone` eklendi ve panel kabuğunun context'ine taşındı:
  formda girilen tarih+saat YEREL duvar saatidir, API mutlak an bekler, çeviri
  `mutlakAnHesapla` ile yapılır. Gizli veri değildir; public booking sayfası da görüyor.

### Kullanıcıya sorulan ve karara bağlanan belirsizlikler (2026-08-19)

Spec madde 5 bunları belirtmiyordu, tahmin edilmedi:

1. **Geçmiş saat** — reddedilir (400), public akışla aynı. Bypass yalnızca çalışma saatiyle sınırlı.
2. **Pasif hizmet** — seçilemez; API `isActive: true` filtresini zorlar, form da pasifleri listelemez.
3. **Alan adı** — istek gövdesinde `startsAt` (kullanıcının ilk yazdığı `startAt` değil), kod
   tabanının tamamıyla tutarlı olsun diye.

### Yan etki: spec satır referanslarının +19 kaydırılması

Spec'e madde 5 eklenmesi "Randevu akışı" bölümünden sonraki her satırı 19 kaydırdı. Kod
yorumları, `schema.prisma`, migration SQL'i ve dokümanlar spec'e SATIR NUMARASIYLA atıf yapıyor
(137 atıf). Eski numaralar bırakılsaydı bunların ~100'ü sessizce yanlış satırı gösterecekti.
Numarası 31 ve üzeri olan tüm atıflar +19 kaydırıldı.

İlk kaydırma taraması EKSİK kaldı ve bunu QA yakaladı: kullanılan kalıp yalnızca "satır" kelimesinin
hemen ardındaki sayıyı görüyordu, `spec satır 24 + 45` / `spec satır 15-16, 59` gibi listelerdeki
İKİNCİ ve sonraki sayıları atlıyordu. 11 atıf yanlış satırı göstermeye devam ediyordu
(`schema.prisma` 5, `shell.tsx`, `appointment-list.tsx`, `service-picker.tsx`, `expiry-sweep.ts`,
`register/page.tsx`, `auth/register/route.ts`). Hepsi elle düzeltildi ve hedef satırlar spec'in
güncel halinde tek tek okunarak doğrulandı.

Bilinen ve DOKUNULMAYAN kusur: `schema.prisma`'daki `spec satır 21-79 (akış)` aralığı zaten bu
değişiklikten ÖNCE de gevşekti (eski hali `21-50` idi, "Randevu akışı" bölümü ise eskiden 21-30
arasındaydı). Mekanik kaydırma orijinal anlamı olduğu gibi taşıdı; yazarın kastını sonradan
daraltmak bu commit'in işi değil.

### QA (2026-08-19) — canlı DB + gerçek `next dev`, 12/12 kabul kriteri PASS

Kod okuma değil çalışma zamanı kanıtı: iki tek kullanımlık işletme gerçek API ile kaydedildi,
senaryolar koşturuldu, sonra silindi.

- 401 (cookie'siz), gövdeye eklenen `businessId` yok sayılıyor (başka işletmenin hizmeti 404).
- Aynı telefonla 7 ardışık manuel randevu → 7/7 `201`; public akışta limit 5 olduğu için
  rate limit'in gerçekten uygulanmadığı ölçülmüş oldu.
- Eşzamanlı iki istek aynı slota → tam olarak biri `201`, diğeri `409 SLOT_TAKEN`.
- Bypass ölçüldü: `GET /api/availability` o gün 18 slot üretip 23:30'u HİÇ önermezken 23:30'a
  manuel randevu `201`; `isClosed: true` istisna gününün 12:00'sine de `201`.
- Geçmiş saat `400`, pasif hizmet `404`, `pendingCount` 0 → 0 (rozet etkilenmiyor).
- Ulaşılamaz sahte bir push aboneliği tanımlanıp manuel randevu oluşturuldu: sunucu logunda
  hiçbir gönderim denemesi yok — push gerçekten gönderilmiyor.
- `whatsappUrl`, aynı işletmedeki bir onay akışının ürettiği URL ile birebir aynı şablonda.
- 13 `publicToken`: 43 karakter base64url, hepsi benzersiz, `id` ile ilişkisiz, sıralı değil.
- CLAUDE.md §2: `src/` altında 200 satırı aşan dosya yok (en büyük: `shell.tsx` 198), `any` yok.

Statik doğrulanan tek madde: panel formu tarayıcıda TIKLANMADI. Butonun varlığı, saat alanının
düz `<input type="time">` olduğu ve formun `/api/availability`'yi hiç çağırmadığı kod okumasıyla
teyit edildi. Uçtan uca tarayıcı testi yapılmadı.

## Faz 9.1 — Manuel randevuda tarih/saat seçimi müşteri akışıyla eşitlendi (2026-08-20)

Faz 9'da saat SERBEST giriliyordu (`<input type="time">`). Kullanıcı geri bildirimi: berber
"kafasına göre" saat yazarsa mevcut bir randevuyla denk gelme ihtimali var; tarih için de düzgün
bir seçim ekranı istiyor ve geçmiş günler seçilememeli.

### Karara bağlanan çelişki

Saatler müsaitlik listesinden gelirse, Faz 9'da spec'e yazılan **çalışma saati bypass'ı UI'dan
ulaşılamaz** hale geliyordu — slot üreteci kapalı gün / kapanış sonrası saat hiç üretmiyor.
Kullanıcıya soruldu, seçim: **bypass korunsun ama varsayılan olmasın.**

### Yapılanlar

- Tarih: public `DatePicker` bileşeni AYNEN kullanılıyor — işletmenin bugününden itibaren
  `REZERVASYON_UFKU_GUN` (14) günlük şerit. Geçmiş gün "seçilemez" yapılmıyor, seçenek olarak
  hiç ÜRETİLMİYOR.
- Saat: public `SlotPicker` + `useAvailability` hook'u AYNEN kullanılıyor. Kopya bir seçici
  yazılmadı — iki liste zamanla ayrışsaydı berber, müşteride görünmeyen bir saati seçebilir
  hale gelirdi. Dolu ve geçmiş saatler listede zaten yok, yani normal akışta çakışma seçilemez.
- Bypass artık "Çalışma saati dışına randevu ekle" onay kutusunun arkasında; açılınca slot
  ızgarasının yerini serbest saat alanı alıyor. Kutu kapalıyken müsaitlik sorgusu da atılmıyor
  (boşuna public okuma kotası yenmesin).
- **API DEĞİŞMEDİ.** `POST /api/appointments/manual` çalışma saatine hâlâ hiç bakmıyor ve saatin
  slot ızgarasından mı serbest alandan mı geldiğini bilmiyor. Bu bilinçli: bypass bir SUNUCU
  politikasıdır, UI ise onu ne zaman kullanacağına karar veren yerdir.
- Hizmet, gün veya mod değişince seçili slot sıfırlanıyor — slot uzunluğu hizmete, liste güne
  bağlı; seçimi taşımak sessizce yanlış saate randevu yazdırırdı.
- Ekleme başarılı da olsa reddedilse de müsaitlik listesi tazeleniyor (409 SLOT_TAKEN sonrası
  bayat liste dolu saati tekrar seçtirirdi).

### 200 satır sınırı için yapılan iki ayırma (CLAUDE.md §2)

- `use-active-services.ts` (YENİ): aktif hizmet çekme, form durumundan bağımsız bir sorumluluk.
- `pending-badge.tsx` (YENİ): `shell.tsx` 203 satıra çıkmıştı; rozetin gösterimi ayrıldı.

### Yan değişiklik

`/api/auth/session` yanıtına `id` eklendi: `GET /api/availability` zorunlu parametre olarak
`businessId` istiyor. Gizli veri değil — public booking sayfası zaten aynı id'yi görüyor.
`timezone` gibi panel kabuğunun context'inde taşınıyor.

### Spec referanslarının yeniden hesaplanması

Spec'e 12 satır daha eklendi. Bu sefer kaydırma sabit bir sayı DEĞİLDİ (madde 5'in içine 6,
sonrasına 10 satır girdi), bu yüzden `difflib` ile eski→yeni satır eşlemesi çıkarılıp her atıf
o eşlemeyle yeniden yazıldı. Faz 9'daki iki kusur da bu turda kapandı:
- Çoklu listelerdeki ikinci ve sonraki sayılar artık yakalanıyor.
- Parantezle bölünen listelere (`schema.prisma` satır 25 ve 139) regex hâlâ ulaşamıyor; ikisi
  elle düzeltildi ve tarama kalıbı bu deseni raporlayacak şekilde çalıştırıldı.

Ayrıca Faz 9'dan devreden GERÇEK bir kusur bulundu: `manual/route.ts` içinde `publicToken` atfı
bir satır kaymıştı (rastgele token yerine slot çakışması satırını gösteriyordu). Mekanik kaydırma
hatayı sadakatle taşımıştı; düzeltildi.

### QA (2026-08-20) — tarayıcıda sürüldü, 8/8 kabul kriteri PASS

Bu tur form UI'ı gerçekten tıklandı (önceki turda statik kalmıştı). İzole bir QA işletmesi
kuruldu, sürüldü, silindi.

- Şerit "BUGÜN 20" ile başladı, 14 gün, geçmiş gün yok. Sunucu UTC'de hâlâ 19 Ağustos iken
  şeridin 20'den başlaması "bugün"ün işletme saat diliminden türetildiğinin kanıtı oldu.
- Panelde 12:00 seçilip kaydedildi → sayfa yenilenmeden ızgara 12:00'siz döndü.
- Panel ve public sayfanın aynı hizmet+gün için ürettiği slot listeleri `diff` ile BİREBİR aynı.
- Checkbox açılınca slot butonu sayısı 0'a düştü, serbest saat alanı geldi; kapalı gün
  istisnasının 23:30'una kayıt yazıldı (public liste o gün boş).
- Hizmet 30 dk → 60 dk yapılınca ve gün değişince seçim boşaldı.
- Arka planda bir slot doldurulup panelden aynı saat gönderildi → "Bu saat az önce doldu."
  ve ızgaradan o saat aynı anda düştü.
- Dünkü API kriterleri (401, CONFIRMED, 409, geçmiş saat 400, pasif hizmet 404, push yok)
  yeniden ölçüldü, hepsi geçerli. `/api/auth/session` yanıtı tam olarak
  `{business:{id,slug,name,email,timezone}}` — `passwordHash`/`phone`/`address` yok.

### QA'nın bulduğu ve düzeltilen kusurlar

1. **`schema.prisma` satır 4 kaydırmadan kaçmıştı** — satır içinde "satır" kelimesi geçmediği
   için ne regex ne difflib eşlemesi ulaşabiliyordu; dört atıf da (owner/staff, online ödeme,
   SMS, AI) tamamen alakasız satırları gösteriyordu. Elle düzeltildi. Bu, "parantezli çoklu
   liste" sınıfının üçüncü örneği — kalıbın kör noktası artık biliniyor.
2. **409 sonrası bayat slot seçimi** — liste tazeleniyordu ama `degerler.slot` artık listede
   olmayan ISO değeri tutmaya devam ediyordu; berber hiçbir şey seçmeden tekrar gönderirse
   aynı dolu saat için ikinci kez 409 alıyordu. Public akışta bunun karşılığı
   `booking-client.tsx`'te türetilmiş bir koruma ile kapatılmıştı, panelde eşi yoktu.
   Aynı desen panele de eklendi (`gecerliSlot`). QA bunu kabul kriteri dışı olduğu için
   FAIL saymamıştı; yine de düzeltildi çünkü "müşteri akışıyla eşdeğer" kararının parçası.
3. **Spec içi iki gevşek atıf** — zaman aşımı bütçesi maddesi satır 63 yerine 63-64'ü
   göstermeli (ifade sarmalın ikinci yarısında). Madde 5'teki "public akıştaki kontrol"
   atfı ise satır numarası yerine "Onaylanan Çıkarımlar" bölümüne isimle atıf yapacak şekilde
   yeniden yazıldı — yeni metinde satır numarası kullanmamak bu kırılganlığın tek gerçek çözümü.

### Bilinen ve DÜZELTİLMEYEN (kullanıcı kararına bırakıldı)

`src/app/api/appointments/route.ts` içindeki çalışma saati kontrolü adımı, alıntıladığı
"sadece UI kontrolü değil" ifadesinin geçtiği satıra (73) atıf yapıyor; o satır aslında slot
çakışmasıyla ilgili. Alıntı doğru yerde ama maddenin konusu farklı. Bu, bu commit'in getirdiği
bir kayma DEĞİL — atıf ilk yazıldığından beri böyle. Kod davranışını etkilemiyor.

