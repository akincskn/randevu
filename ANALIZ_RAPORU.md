# Analiz Raporu — Berber/Kuaför Randevu Sistemi

Bu belge, `C:\Users\akinc\Randevu` deposunun mevcut durumunu belgelemek üzere hazırlanmıştır.
Her iddia bir dosya yolu, satır numarası veya commit SHA'sı ile desteklenir. Repoda karşılığı
bulunamayan bilgiler bölüm içinde açıkça **"repoda kayıtlı değil"** olarak işaretlenmiştir.

Rapor tarihi: 2026-08-17 · Analiz edilen commit: `9295df9` (`master`, toplam 26 commit)

---

## 1. Proje Özeti

Berber ve kuaförler için ücretsiz, basit bir randevu sistemi (`PROJECT_SPEC.md:8`).
Hedef ilk kullanıcı kitlesi, `PROJECT_SPEC.md:9`'da açıkça tanımlanmış: *"şu an hiçbir dijital
sistem kullanmayan (deftere/hafızaya yazan) esnaf."* İş modeli, `PROJECT_SPEC.md:10`'a göre her
berberin kendi bağımsız `Business` kaydı olmasıdır; owner/staff hiyerarşisi v1'de yoktur.

### v1 kapsamı

| Alan | İçerik | Kaynak |
| --- | --- | --- |
| İşletme kaydı | isim, telefon, opsiyonel adres, sektör (`BERBER` / `KUAFOR` enum) | `PROJECT_SPEC.md:15-16` |
| Hizmet listesi | isim, süre (dakika), opsiyonel fiyat (bilgi amaçlı, online ödeme yok) | `PROJECT_SPEC.md:17` |
| Çalışma saatleri | haftalık tekrar eden program + tekil gün istisnaları | `PROJECT_SPEC.md:18-19` |
| Randevu akışı | müşteri public linkten talep (`PENDING`) → berber onaylar (`CONFIRMED`) → manuel WhatsApp mesajı | `PROJECT_SPEC.md:22-30` |
| Zaman aşımı | çalışma saatine duyarlı; sabit "2 saat" kuralı yok | `PROJECT_SPEC.md:32-35` |
| Bildirim | Web Push (VAPID): anlık yeni talep + günlük bekleyen özeti | `PROJECT_SPEC.md:36-38` |
| Güvenlik | rastgele token, DB seviyesinde slot çakışma koruması, rate limit, Turnstile | `PROJECT_SPEC.md:41-46` |
| Kimlik doğrulama | berber: email/şifre; müşteri: hesap yok, ad + telefon | `PROJECT_SPEC.md:48-50` |

Randevu akışının kritik özelliği, WhatsApp mesajının **MANUEL** gönderilmesidir
(`PROJECT_SPEC.md:28`: *"Berber linke tıklar → kendi WhatsApp'ı açılır → mesajı gönderir.
Bu adım MANUEL, otomatik değil."*).

Ürün 2026-08-17'de canlıya alınmıştır: `https://randevu-five.vercel.app` (`ROADMAP.md:517`).

---

## 2. Teknoloji Yığını

Aşağıdaki versiyonlar `package.json`'dan birebir alınmıştır — tahmin veya yuvarlama yoktur.

| Katman | Seçim | Versiyon (`package.json`) |
| --- | --- | --- |
| Framework | Next.js (App Router) | `16.3.1` (`package.json:15`) |
| UI | React / React DOM | `19.2.8` (`package.json:17-18`) |
| Dil | TypeScript strict | `^5` (`package.json:34`) |
| ORM | Prisma Client + `@prisma/adapter-pg` | `^7.9.1` (`package.json:12-13`) |
| Postgres sürücüsü | `pg` | `^8.23.0` (`package.json:16`) |
| Cache / rate limit | `@upstash/redis` | `^1.38.2` (`package.json:14`) |
| Push | `web-push` | `^3.6.7` (`package.json:19`) |
| Doğrulama | Zod | `^4.4.3` (`package.json:20`) |
| Stil | Tailwind CSS | `^4` (`package.json:33`) |
| Lint | ESLint + `eslint-config-next` | `^9` / `16.3.1` (`package.json:30-31`) |

### Seçim gerekçeleri

**Next.js 16.3.1 — sürüm varsayımı yasak.** `CLAUDE.md` §1 açıkça uyarıyor: *"installed — verify
exact version with package.json before writing code; do not assume Next.js 14 APIs"*. Depo
kökündeki `AGENTS.md` aynı noktayı tekrarlıyor: *"This is NOT the Next.js you know"* ve
`node_modules/next/dist/docs/` altındaki rehberin okunmasını zorunlu kılıyor. Bu uyarının pratik
karşılığı gerçekten yaşandı: `ROADMAP.md:444-449`, `notFound()` render'ının Next.js 16.3.1'de root
layout dışında oluştuğunu ve bunun framework davranışı olduğunu (üç ayrı yöntemle doğrulanarak)
kayıt altına alıyor.

**Neon PostgreSQL + Prisma 7 driver adapter.** `prisma/schema.prisma:10-14`, Prisma 7'nin bir
breaking change'ini belgeliyor: `url` / `directUrl` artık `schema.prisma` içinde desteklenmiyor
(hata `P1012`). Bağlantı URL'leri `prisma.config.ts`'e taşındı; migration `DIRECT_URL` (Neon direct),
runtime `PrismaClient` ise `DATABASE_URL` (Neon **pooled**) üzerinden driver adapter ile çalışıyor.
İki ayrı bağlantı dizesi `README.md:65-66`'da da zorunlu olarak listeleniyor.

PostgreSQL'in bu projede seçilmesinin somut teknik nedeni, aşağıda §3'te açıklanan
`EXCLUDE USING gist` kısıtıdır: `prisma/schema.prisma:150-164`, bu kısıtın `btree_gist` ve
`tstzrange` gerektirdiğini ve `TIMESTAMPTZ` olmadan IMMUTABLE olamayacağını belgeliyor. Yani
veritabanı seçimi, çakışma korumasının nasıl uygulanacağıyla doğrudan bağlantılıdır.

**Upstash Redis.** `PROJECT_SPEC.md:45` rate limiting için Upstash Redis'i doğrudan adlandırıyor.
Uygulaması `src/lib/redis.ts` (paylaşılan istemci), `src/lib/rate-limit.ts` (telefon başına günlük
kota) ve `src/lib/read-limit.ts` (public GET route'ları için IP bazlı limit) dosyalarında.

**Upstash QStash — Vercel Cron değil.** Gerekçe repoda üç ayrı yerde kayıtlı ve aynı:
`PROJECT_SPEC.md:116-119` (*"Vercel Cron ücretsiz planda günde yalnızca 1 tetikleme verdiği için
elendi"*), `STRUCTURE.md:107-110` ve `README.md:107-108`. Günde tek tetikleme, iki gereksinimi
birden taşıyamıyor: (a) "açılıştan 1-2 saat sonra" zaman aşımı kuralı, (b) her işletmeyi **kendi**
açılış saatinde yakalaması gereken günlük özet. Ek gerekçe `PROJECT_SPEC.md:119`'da: Upstash hesabı
projede zaten kuruluydu, yani yeni bir sağlayıcı eklenmedi.

**Web Push API (VAPID) — Firebase yok.** `CLAUDE.md` §1: *"Web Push API (VAPID) for notifications —
no Firebase, no paid push service"*. `PROJECT_SPEC.md:36` aynı kararı ürün tarafında tekrarlıyor:
*"Web Push bildirimi (VAPID, ücretsiz, Firebase yok)"*. `prisma/schema.prisma:204-205` push
abonelik modelinin başında yine "Firebase YOK" notunu taşıyor.

**Cloudflare Turnstile.** `PROJECT_SPEC.md:46`: *"Basit bot/insan doğrulaması (örn. Cloudflare
Turnstile) — ücretsiz, SMS/OTP maliyeti yok."* Yani seçim gerekçesi doğrudan maliyettir; aynı satır
SMS/OTP alternatifini maliyet nedeniyle eliyor. Uygulaması `src/lib/turnstile.ts` ve
`src/components/public/turnstile-widget.tsx`.

**scrypt — bcrypt/argon2 yerine.** `src/lib/password.ts:10-16` gerekçeyi açıkça yazıyor: scrypt Node
çekirdeğinde bulunan, bellek-zor (memory-hard) bir KDF'tir; native derleme gerektiren bir paket
eklemek Vercel free tier'da gereksiz kırılganlık yaratır (`CLAUDE.md` §2 KISS ilkesine atıf).

**Vercel free tier.** `CLAUDE.md` §1: *"Deployment: Vercel (free tier)"*. Ücretsiz planın sınırları
en az iki mimari kararı doğrudan belirlemiştir: QStash seçimi (yukarıda) ve `package.json:7`'deki
`build` script'i (`prisma generate && next build` — gerekçe §6'da).

**Tailwind CSS 4.** `package.json:23,33`'te mevcut ve `README.md:37`'de listeleniyor;
**seçim gerekçesi repoda kayıtlı değildir** — `CLAUDE.md`, `PROJECT_SPEC.md` ve `ROADMAP.md`
stil katmanı için bir gerekçe yazmamış.

---

## 3. Mimari Kararlar

### 3.1 Çakışma koruması veritabanı seviyesinde (EXCLUDE constraint)

`CLAUDE.md` §2 bunu bir kural olarak koyuyor: *"Every write to a uniqueness-sensitive resource
(e.g., booking a slot) goes through a database-level constraint, not just an application-level check.
Race conditions are solved in the database, not the UI."* `PROJECT_SPEC.md:43-44` aynı şeyi ürün
tarafında istiyor.

Uygulanan kısıt `prisma/migrations/20260814000000_init/migration.sql`'in sonunda:

```sql
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap_excl"
    EXCLUDE USING gist (
        "businessId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("status" NOT IN ('CANCELLED', 'EXPIRED'));
```

Migration SQL'i, daha basit iki alternatifin neden reddedildiğini de belgeliyor:

1. **`@@unique([businessId, startsAt])` yetersizdir**, çünkü koşulsuz unique iptal edilmiş
   randevunun da slotu sonsuza kadar bloklamasına yol açar — iptal edilen saat bir daha satılamaz.
2. **Daha kötüsü**, yalnızca aynı başlangıç saatini engeller: 10:00 (60 dk) randevusu varken
   10:30 randevusu DB düzeyinden geçerdi; gerçek **aralık** çakışması korumasız kalırdı.

Aynı gerekçeler `prisma/schema.prisma:141-171`'de şema dokümantasyonu olarak tekrarlanıyor.

İki incelikli tasarım kararı daha var ve ikisi de yazılı:

- **Predicate bilerek olumsuz yazıldı** (`NOT IN ('CANCELLED','EXPIRED')`). Gerekçe fail-safe:
  enum'a ileride yeni bir durum eklenip predicate güncellenmezse, olumlu liste kullanılsaydı yeni
  durum sessizce slotu **bırakırdı** → çift rezervasyon. Olumsuz listede yeni durum varsayılan
  olarak slotu **tutar** → en kötü ihtimalle fazladan katılık, veri bozulmaz.
- **`'[)'` yarı-açık sınır**: bitişik randevular (10:00–10:30 ve 10:30–11:00) çakışma sayılmaz.
- **`TIMESTAMPTZ` zorunluluğu**: `tstzrange` yapıcısının IMMUTABLE olabilmesi için `startsAt` /
  `endsAt` `@db.Timestamptz(3)` olmak zorundadır (`prisma/schema.prisma:163-164`); düz `TIMESTAMP`
  ile çevrim yalnızca STABLE olur ve PostgreSQL kısıtı reddeder.

Kısıt Prisma şema dilinde ifade edilemediği için elle yazılmıştır ve migration SQL'i
*"Sonraki `prisma migrate diff` çağrılarında 'drift' olarak görünebilir — SİLMEYİN"* uyarısını
taşır (`prisma/schema.prisma:166-167` aynı uyarıyı tekrarlıyor).

İhlalin uygulama tarafında nasıl ele alınacağı da not edilmiş: Postgres `23P01`
(`exclusion_violation`), unique ihlalinin (`23505`) aksine Prisma'da `P2002`'ye **eşlenmez**; ham
hata koduna bakılmalıdır (`prisma/schema.prisma:170-171`). Bu not boşuna yazılmamış — §6'da
anlatılan `6a9207d` hatası tam olarak buydu.

### 3.2 WhatsApp entegrasyonu: manuel link, resmi API yok

`PROJECT_SPEC.md:29` kararı ve gerekçesini tek cümlede veriyor:
*"WhatsApp Business API kullanılmıyor, resmi entegrasyon yok, **ek maliyet yok**."*
`PROJECT_SPEC.md:55` aynı şeyi kapsam dışı listesinde tekrarlıyor.

Uygulamada bu kararın somut karşılığı `src/lib/whatsapp.ts`'tir. Dosyanın başındaki yorum
(`src/lib/whatsapp.ts:6-9`) sınırı net çiziyor: *"Burada üretilen tek şey bir URL'dir — bu modül
hiçbir mesaj göndermez, dış servise çağrı yapmaz."* Fonksiyon (`onayWhatsappLinki`,
`src/lib/whatsapp.ts:41-64`) mesaj metnini kurar, `encodeURIComponent` ile kodlar ve bir URL string'i
döndürür. Ağ çağrısı yoktur. Faz 7 QA'sı bunu ayrıca taradı: `ROADMAP.md:386` —
*"`wa.me` yalnızca URL üretiyor, dış servise çağrı yapmıyor."*

Hedef adresin `wa.me`'den `api.whatsapp.com/send/`'e çevrilmesi ayrı bir karardır ve gerekçesi
ölçümdür, tercih değil — ayrıntısı §6.5'te.

> **Mevzuat boyutu — repoda kayıtlı değildir.** `PROJECT_SPEC.md`, `CLAUDE.md`, `ROADMAP.md`,
> `README.md` ve tüm commit gövdeleri tarandı; KVKK, 6563 sayılı Elektronik Ticaretin Düzenlenmesi
> Hakkında Kanun veya herhangi bir mevzuat gerekçesi bu depoda **geçmiyor**. Repoda yazılı olan tek
> gerekçe maliyet ve kapsamdır (`PROJECT_SPEC.md:29,55`). Genel bir değerlendirme olarak — bu
> depodaki hiçbir belgeye dayanmadan — otomatik ticari mesaj gönderimi Türkiye'de izin/onay
> yükümlülükleri doğuran bir alandır ve mesajı işletmenin kendi WhatsApp hesabından manuel
> göndermesi bu yükümlülüğü sistemin üzerinden alır; ancak bu değerlendirme repoda kayıtlı bir
> proje kararı **değildir** ve öyle sunulmamalıdır.

### 3.3 Business-hours-aware zaman aşımı

`PROJECT_SPEC.md:33` sabit kuralı açıkça reddediyor: *"Sabit '2 saat sonra otomatik iptal' KURALI
YOK (gece verilen randevuları haksız cezalandırır)."* `PROJECT_SPEC.md:34-35` yerine geçen kuralı
tanımlıyor: zaman aşımı işletmenin çalışma saatlerine göre hesaplanır ve **kapalı saatlerde geçen
süre sayılmaz**.

Spec bağlayıcı bir sayı vermediği için ("örn. ilk 1-2 saat") bu, "Onaylanan Çıkarımlar"da
2026-08-16'da karara bağlandı (`PROJECT_SPEC.md:102-107`): **bütçe 120 dakikadır ve yalnızca AÇIK
geçen dakikalar birikir.** Kapalıyken sayaç durur, ertesi açılışta kaldığı yerden devam eder.
Spec'in verdiği örnekler: gece 02:00'de gelen talep 09:00 açılışlı bir dükkanda 11:00'de düşer;
17:30'da gelen talep ertesi gün açılıştan 90 dakika sonra düşer.

Kod karşılığı `src/lib/expiry.ts`:

- `ZAMAN_ASIMI_DAKIKA = 120` (`src/lib/expiry.ts:21`), yorumu doğrudan kullanıcı kararına atıf yapar.
- `acikGecenSureMs()` (`src/lib/expiry.ts:99-129`) gün gün yürüyerek açık pencerelerin kesişimini
  toplar. Birikim **duvar saati farkıyla değil mutlak zaman farkıyla** ölçülür; gerekçe
  `src/lib/expiry.ts:92-94`'te: yaz saati geçişinde 09:00–18:00 açık bir gün gerçekte 9 değil
  8 saattir.
- `randevuSuresiDolduMu()` (`src/lib/expiry.ts:145-155`) iki koşulu birleştirir; hangisi önce
  gerçekleşirse o uygulanır.

**İkinci koşul (`startsAt` geçtiyse EXPIRED)** spec'te hiç yoktu ve `PROJECT_SPEC.md:108-111`'de
karara bağlandı. Gerekçesi doğrudan §3.1'deki kısıtla bağlantılı: geçmiş bir saati onaylamak
anlamsızdır ve o slot `Appointment_no_overlap_excl` gereği boşuna dolu tutulur.

**`expiresAt` kolonu bilinçli olarak EKLENMEDİ** (`PROJECT_SPEC.md:112-115`). Gerekçe: berber
çalışma saatlerini veya bir istisna gününü randevu oluşturulduktan **sonra** değiştirebilir;
saklanan bir son tarih o anda eskir ve geri doldurma mantığı gerektirirdi. Bunun yerine hesap
süpürme anında yapılır.

Üç dosyaya bölünme de gerekçeli (`STRUCTURE.md:114-117`): `expiry.ts` **saf** matematiktir,
veritabanına dokunmaz; `expiry-sweep.ts` okuma/yazma yapar ve özeti sürer;
`api/cron/expire-appointments/route.ts` yalnızca kimlik doğrular (`ROADMAP.md:256-257`: 34 satır).
Route'ta **GET yoktur** — gerekçesi `STRUCTURE.md:112`: tarayıcıda kazara açılan bir adres randevu
durumu değiştirmemelidir.

Uygulama sırasında seçilen ve spec'te bulunmayan iki parametre kullanıcıya bildirilmiş
(`ROADMAP.md:266-270`): `OZET_PENCERESI_DAKIKA = 30` (`src/lib/expiry-sweep.ts:27`) ve
`MAX_GUN = 400` (`src/lib/expiry.ts:31`, sonsuz döngü koruması; sınıra ulaşılırsa randevu
"dolmamış" sayılır — fail-safe yön).

### 3.4 DTO katmanı ve API/Prisma ayrımı

`CLAUDE.md` §2: *"DTO pattern between database models and API responses — never leak raw Prisma
models to the client."* `src/lib/dto.ts:3-8` bu kuralı alıntılayarak neyi sızdırmamak gerektiğini
sayıyor: `Business.passwordHash`, iç `id` alanları ve `publicToken` (yalnızca onu zaten bilen
tarafa verilir).

DTO katmanı **hedef kitleye göre ikiye bölünmüştür**: `src/lib/dto.ts` (public) ve
`src/lib/dto-dashboard.ts` (berber paneli). Gerekçe `STRUCTURE.md:98-102`'de: bölme rastgele boyut
için değil, **iki katmanın gerçekten farklı sözleşmelere sahip olması** için yapıldı — `isActive` ve
iç `id`, public DTO'da gizlidir ama panel için gereklidir. Aynı bölünme Zod şemalarında da var
(`schemas.ts` / `schemas-dashboard.ts`).

DTO'nun yalnızca alan gizleme aracı olmadığının bir örneği `src/lib/dto.ts:19-24`: `business.timezone`
DTO'ya **bilerek eklenmiştir**, çünkü `startsAt` mutlak bir andır ve müşteriye işletmenin yerel
saatiyle gösterilmelidir; ziyaretçinin cihaz dilimiyle biçimlendirmek yurt dışındaki müşteriye
yanlış saati gösterirdi.

Sayfaların Prisma'ya doğrudan erişememesi ayrı bir kuraldır (`STRUCTURE.md:124-125`) ve üç public
GET route'unun (`businesses/[slug]`, `availability`, `appointments/token/[token]`) varlık sebebidir
(`STRUCTURE.md:94-97`): bu kural olmasaydı public sayfaların veri kaynağı olmazdı.

Bir istisna açıkça karara bağlanmıştır: `GET /api/appointments/token/[token]` yanıtı iç
`Appointment.id` alanını **döndürür** (`PROJECT_SPEC.md:85-89`). Gerekçe: iptal butonu
`PATCH /api/appointments/[id]/cancel` çağırıyor ve o endpoint id'yi path'te bekliyor. Bu yanıtı
yalnızca `publicToken`'ı bilen alır, iptal aynı token'ı ayrıca doğrular ve `publicToken` id'den
türetilebilir değildir — yani spec satır 42 korunur.

### 3.5 Fail-open ve fail-closed kararları

Bu proje, dış servis erişilemezliğinde ne yapılacağını **tek bir kural olarak değil, yüzey yüzey**
karara bağlamıştır. Hepsinin gerekçesi `PROJECT_SPEC.md` "Onaylanan Çıkarımlar"da yazılıdır.

| Yüzey | Davranış | Kod | Gerekçe |
| --- | --- | --- | --- |
| Upstash rate limit (sunucu) | **fail-open** — kontrol atlanır, loglanır | `src/lib/rate-limit.ts:77-80` | `PROJECT_SPEC.md:75-79` |
| Turnstile doğrulama (sunucu) | **fail-open** — ulaşılamazsa atlanır | `src/lib/turnstile.ts:53-56`, `61-64` | `PROJECT_SPEC.md:75-79` |
| Turnstile açık "bot" kararı | **uygulanır** — 403 `TURNSTILE_FAILED` | `src/lib/turnstile.ts:67-74` | `PROJECT_SPEC.md:77-79` |
| Turnstile widget (istemci) | **fail-closed** — gönderim kilitli kalır | `src/components/public/turnstile-widget.tsx:102-104` | `PROJECT_SPEC.md:131-135` |
| Redis günlük özet kilidi | **fail-open** — özet yine gönderilir | `src/lib/digest-lock.ts:43-50` | `PROJECT_SPEC.md:120-126` |
| Slug varlık kontrolü (API kesintisi) | **fail-open** — 404 verilmez | `ROADMAP.md:409-410` | aynı politika yönü |

**Sunucu tarafı fail-open'ın gerekçesi** `PROJECT_SPEC.md:75-79`'da: *"Bir altyapı kesintisinin
dükkanın online randevusunu tamamen kapatması, kötüye kullanım riskinden daha maliyetli görüldü."*
Aynı madde kritik ayrımı da koyuyor: **ulaşılamama ≠ reddedilme**. `src/lib/turnstile.ts:26-27` bu
ayrımı kodda tekrarlıyor: *"'Cloudflare cevap vermedi' ile 'Cloudflare bot dedi' bilinçli olarak
ayrılır: birincisi bizim altyapı sorunumuz, ikincisi gerçek bir ret kararıdır."*

**İstemci tarafı ise fail-closed'dır** ve bu bir tutarsızlık değil, açıkça yazılmış bir istisnadır.
`PROJECT_SPEC.md:131-135`: *"Sunucu tarafı fail-open politikası burada GEÇERLİ DEĞİLDİR:
'Cloudflare'e ulaşamadık' bizim altyapı sorunumuzdur ve atlanabilir, ancak 'istemci hiç doğrulama
yapmadı' bot korumasının tamamen devre dışı kalması demektir. Sessiz kilitlenme yasak."* Bu kararın
canlıda görünen sonucu Faz 8'de ölçüldü: Turnstile production hostname'lerini tanımadığında
(`Error: 110200`) gönderim butonu kilitli kaldı ve `ROADMAP.md:538-540` bunu bir kusur değil
*"spec'in 2026-08-15 kararının doğru davranışı"* olarak kaydetti.

**Redis digest kilidi fail-open'dır** (`PROJECT_SPEC.md:123-125`): *"bir altyapı kesintisinin
bildirimi tamamen susturması, nadir bir çift bildirimden daha maliyetli görüldü."*

Fail-open'ın bir yan etkisi ve onun kapatılması §6.1'de anlatılan rate-limit bypass hatasıdır.

### 3.6 Ortam değişkenlerinin üç ayrı şemaya bölünmesi

`src/lib/env.ts` üç ayrı doğrulayıcı barındırır: `serverEnv()` (`:34`), `pushEnv()` (`:79`),
`cronEnv()` (`:113`). Bölünmenin gerekçesi `src/lib/env.ts:50-57`'de yazılıdır ve bir tahmin değil,
Faz 5 QA'sında ölçülen bir davranıştan gelmiştir: VAPID değişkenleri `serverEnvSchema`'ya konsaydı,
bozuk tek bir VAPID değeri `serverEnv()`i fırlatır ve o fonksiyonu `prisma.ts` de çağırdığı için
**veritabanı bağlantısı kurulamazdı** — bir push yapılandırma hatası randevu almayı tamamen
durdururdu. `cronEnv()` aynı gerekçeyle ayrılmıştır (`src/lib/env.ts:94-100`).

Doğrulama **lazy**'dir (`src/lib/env.ts:27-33`): `next build` sırasında modül import edilse bile
gerçekten bir istek işlenene kadar çalışmaz, böylece build ortamında Upstash/Turnstile anahtarları
bulunmasa da derleme başarısız olmaz.

### 3.7 Diğer kayda değer mimari kararlar

- **Cron koruması ortak sır ile, QStash imzasıyla değil** (`PROJECT_SPEC.md:127-130`,
  `src/lib/cron-auth.ts:16-18`): sağlayıcıdan bağımsız kalır ve `curl` ile elle test edilebilir.
  Karşılaştırma `timingSafeEqual` ile sabit sürelidir (`src/lib/cron-auth.ts:34`); uzunluk farkı
  önce kontrol edilir çünkü `timingSafeEqual` uzunluk uyuşmazlığında fırlatır.
- **Token entropisi**: `src/lib/tokens.ts:10-13` — 32 bayt = 256 bit, `base64url` ile 43 karakter,
  URL'de kaçış gerektiren karakter yok. `PROJECT_SPEC.md:42` ve `CLAUDE.md` §2'ye atıflı.
- **Rate limit penceresi Europe/Istanbul takvim gününe göre** (`src/lib/rate-limit.ts:12-19`):
  UTC kullanılsaydı pencere yerel saatle 03:00'te sıfırlanır ve aynı numara 02:00'de 5, 03:05'te
  5 talep daha atabilirdi. Aynı gerekçe digest kilidinde tekrar ediliyor
  (`src/lib/digest-lock.ts:11-13`).
- **Push iki dosyaya bölünmüş** (`STRUCTURE.md:118-121`): `push.ts` yalnızca **taşıma**
  (`src/lib/push.ts:12-16`), `push-notifications.ts` yalnızca **içerik**. Ölü abonelikler
  (HTTP 404/410) silinir, geçici hatalarda (429/5xx/ECONNREFUSED) silinmez (`ROADMAP.md:171-175`).
- **Çalışma saatleri yerel duvar saati olarak saklanır** (`prisma/schema.prisma:104-107`):
  "dükkan 09:00'da açar" ifadesi yaz/kış saati veya tz kuralı değişse bile 09:00 kalmalıdır;
  mutlak zamana çevrim uygulama katmanında `Business.timezone` ile yapılır.
- **`Service.isActive`** (`prisma/schema.prisma:86-92`,
  `prisma/migrations/20260816000000_add_service_is_active/migration.sql`): `Appointment.service`
  ilişkisi `onDelete: Restrict` olduğu için randevusu olan hizmet silinemez; berberin artık
  sunmadığı hizmeti listeden çıkarmasının başka yolu yoktu. Migration `DEFAULT true` ile geriye
  dönük davranış değişikliği yaratmaz.
- **200 satır sınırı fiilen tutulmuştur.** `src/` altındaki en uzun TypeScript dosyası
  `src/components/dashboard/shell.tsx` (196 satır); toplam 85 TS/TSX dosyası, 7.400 satır,
  17 API route, 30 `lib/` modülü. `CLAUDE.md` §2 sınırın `prisma/schema.prisma` ve migration
  SQL'ini kapsamadığını ayrıca belirtiyor.

---

## 4. Geliştirme Metodolojisi (Agent Team yaklaşımı)

Proje, `.claude/agents/` altında tanımlı dört rolle yürütülmüştür (`CLAUDE.md` §4).

| Rol | Yapar | Yapmaz | Kaynak |
| --- | --- | --- | --- |
| `team-lead` | ayrıştırma, delegasyon, sentez | uygulama kodu yazmaz, **ürün kararı vermez** | `.claude/agents/team-lead.md:8-10` |
| `fullstack-developer` | spec'e karşı uygulama | spec'te olmayan davranışı **icat etmez** | `.claude/agents/fullstack-developer.md:15-17` |
| `qa-tester` | spec kriterlerine karşı doğrulama | özellik yazmaz, **düzeltme önermez** | `.claude/agents/qa-tester.md:8-9` |
| `architecture-analyst` | salt-okunur olgusal analiz | öneri/kalite yorumu **yapmaz** | `.claude/agents/architecture-analyst.md:7-8` |

### Rollerin ayrılma nedeni

Ayrım, her rolün **neyi yapamayacağı** üzerinden kurulmuştur:

- `team-lead` ürün kararı veremez. `.claude/agents/team-lead.md:19-21`: spec'te açıkça
  kapsanmayan bir karar gerekiyorsa **DUR** — kullanıcının hangi yorumu tercih edeceğini tahmin
  etme, soruyu doğrudan kullanıcıya sun ve cevap gelene kadar aşağı hiçbir şey delege etme.
- Her alt görev, uyguladığı `PROJECT_SPEC.md` bölümünü **birebir alıntılamak zorundadır**; böyle
  bir bölüm yoksa görev delege edilemez, açık soru olarak kullanıcıya taşınır
  (`.claude/agents/team-lead.md:16-18`).
- Geliştirici kendi işini onaylayamaz. `.claude/agents/team-lead.md:23-25`: bir özellik tamamlandı
  raporlandığında doğrulama `qa-tester`'a delege edilir; *"Never mark a task complete based on the
  developer's own claim alone."*
- QA öznel yorum yapamaz (`.claude/agents/qa-tester.md:20-21`) ve her "pass"/"fail" iddiası
  gerçekten çalıştırılmış bir komuta dayanmak zorundadır — *"never asserted from reading the code
  alone"* (`.claude/agents/qa-tester.md:13-14`).
- QA'nın test etmesi zorunlu edge case'ler rol tanımında sabitlenmiştir
  (`.claude/agents/qa-tester.md:23-28`): eşzamanlı çift rezervasyon (tam biri başarılı olmalı) ve
  zaman aşımının sabit duvar saati değil çalışma saati farkındalıklı olduğu (özellikle gece
  randevusu).
- `architecture-analyst` her iddiayı dosya yolu ve satır numarasıyla desteklemek zorundadır ve
  niyet hakkında spekülasyon yapamaz (`.claude/agents/architecture-analyst.md:11-16`).

### Zero-Ambiguity Protocol

`CLAUDE.md` §0, tüm agent'ları bağlayan ilk kuraldır ve dört yasak içerir:

1. `PROJECT_SPEC.md`'de açıkça yazmayan bir gereksinim **çıkarımla doldurulamaz** — dur ve sor.
2. Tahmin, olgu gibi sunulamaz; *"Never say 'I assume X' and proceed."*
3. Kapsam sessizce değiştirilemez — "daha iyi görünse bile" önce öner, onay al, sonra uygula.
4. Bir build/test hatası **birebir çıktısıyla** raporlanır; ilerleme daha iyi görünsün diye
   yumuşatılamaz veya gizlenemez.

Ayrıca: placeholder kod yok, `// TODO: implement later` yok, gerçekmiş gibi sunulan mock veri yok,
`any` kaçış kapısı yok. Bir şey mevcut adımda bitirilemiyorsa bu açıkça söylenir ve orada durulur.

Bu protokolün pratikte çalıştığı repoda izlenebilir: `PROJECT_SPEC.md`'nin **"Onaylanan Çıkarımlar"**
bölümü (satır 68-151), spec'te lafzen olmayan ama gerekli olan **16 ayrı kararı** tarih ve gerekçesiyle
kayıt altına alır. Yani belirsizlikler tahminle kapatılmamış, kullanıcıya sorulup onaylandıktan
sonra belgeye yazılmıştır.

### Faz bazlı ilerleme

`ROADMAP.md:3-8`: fazlar **sırayla** yürütülür; bir fazı atlamak veya sırayı değiştirmek — teknik
bir bağımlılık gerektirse bile — kullanıcı onayı olmadan yapılamaz. Her faza başlamadan önce hangi
fazda olunduğu ve bir sonraki fazın `PROJECT_SPEC.md`'nin hangi bölümüne dayandığı belirtilir.

Bu kuralın çiğnendiği tek yer de onaylıdır: `confirm` endpoint'i Faz 2'ye çekilmiştir, çünkü kimlik
doğrulaması olmadan randevu ID'sini bilen herkes başkasının randevusunu onaylayabilirdi — sıra
değişikliği 2026-08-15'te kullanıcı onayıyla yapıldı (`ROADMAP.md:55-57`).

Sekiz faz tamamlanmıştır: Faz 1 veritabanı, Faz 2 API + auth, Faz 3 public booking, Faz 4 dashboard,
Faz 5 push, Faz 6 cron, Faz 7 uçtan uca QA, Faz 8 ilk deploy (`ROADMAP.md:15,28,59,111,168,240,327,513`).

---

## 5. Test ve Doğrulama Disiplini

### Doğrulama turlarının sayımı

`ROADMAP.md`'de kayıtlı, ayrı ayrı adlandırılmış doğrulama turları:

| Faz | Tur | Kapsam | Kaynak |
| --- | --- | --- | --- |
| Faz 2 | 3 tur `qa-tester` | API + auth | `ROADMAP.md:45-46` |
| Faz 3 | 1 tur `qa-tester` | 5 başlık | `ROADMAP.md:86-87` |
| Faz 4 | 1 tur `qa-tester` | 8 başlık | `ROADMAP.md:146-147` |
| Faz 5 | 1 tur `qa-tester` + gerçek tarayıcı zinciri | gönderim yolu + FCM | `ROADMAP.md:201-225` |
| Faz 6 | **bağımsız QA YOK** (aşağıya bakın) | 19 saf senaryo + 28 canlı doğrulama | `ROADMAP.md:274-296` |
| Faz 7 | 1 bağımsız `qa-tester` oturumu | ~100 başlık, **0 FAIL** | `ROADMAP.md:331-332` |
| Faz 7 | Faz 6'nın bağımsız yeniden doğrulaması | 46 başlık | `ROADMAP.md:335` |
| Faz 7 | `qa-metadata` oturumu | 24 başlık: 21 PASS / 2 FAIL / 1 test edilemedi | `ROADMAP.md:433-434` |
| Faz 7 | `qa-son-tur` oturumu | **23/23 PASS, FAIL yok** | `ROADMAP.md:466` |
| Faz 8 | uçtan uca smoke test (gerçek production) | tam zincir | `ROADMAP.md:542-557` |

Yani **en az 9 ayrı doğrulama turu** ROADMAP'te ismen kayıtlıdır. Toplam senaryo sayısı tek bir
rakamla verilmemiştir; belgede sayılan başlıklar şunlardır: ~100 (Faz 7 genel) + 46 (Faz 6 yeniden)
+ 24 (`qa-metadata`) + 23 (`qa-son-tur`) + 19 saf hesap senaryosu + 28 canlı süpürme doğrulaması
+ 8 (Faz 4) + 5 (Faz 3) + 13 gerçek pointer etkileşimi (`ROADMAP.md:362`) + 12/12 cron yetkilendirme
+ 10/10 günlük özet + 4/4 `cronEnv()` izolasyonu. Bunlar farklı turlarda ve farklı granülariteyle
sayıldığı için **toplamları tek bir "senaryo sayısı" olarak toplanmamıştır** — ROADMAP böyle bir
toplam vermiyor.

### Gerçek ortamda test edilenler

Bu projede doğrulamalar mock'a değil canlı servislere karşı yapılmıştır:

- **Canlı Neon**: eşzamanlı isteklerle slot çakışması `409 SLOT_TAKEN` kanıtlandı
  (`ROADMAP.md:46-47`); Faz 7'de 4 eşzamanlı istek **tam 1×201 / 3×409** verdi (`ROADMAP.md:379`).
- **Canlı Upstash**: telefon kotası 6. istekte 429'a düştü (`ROADMAP.md:379-380`); NX kilidi
  Upstash'te **TTL=93599 sn** ile gerçekten oluştu (`ROADMAP.md:350`).
- **Gerçek FCM**: Faz 5'te gerçek `pushManager.subscribe` ile gerçek bir FCM endpoint'i üretildi
  (`https://fcm.googleapis.com/fcm/send/crYV9DlBfOI:APA91bH…`), sunucudan Google'ın push servisine
  gönderim `{toplam:1, basarili:1}` döndü ve **bildirim ekranda göründü** (`ROADMAP.md:209-220`).
- **Gerçek Turnstile**: RET dalı ilk kez gerçek tarayıcı token'ıyla doğrulandı — 403
  `TURNSTILE_FAILED`, randevu oluşmadı, widget sıfırlandı (`ROADMAP.md:89-91`).
- **Gerçek QStash**: `*/15 * * * *` zamanlaması kaydedildi, 17:00 turu Upstash konsolunda
  "Delivered", 3 sn, hata yok (`ROADMAP.md:561-563`).
- **Gerçek Chrome / Playwright**: Faz 7'de 13 etkileşimin tamamı gerçek pointer olaylarıyla
  çalıştırıldı (`ROADMAP.md:362-365`); 390px mobil düzende yatay taşma yok, konsol temiz
  (`ROADMAP.md:382`).

Ölçümlerin bazıları "karar verildi" seviyesinde değil **teslimat** seviyesindedir:
`ROADMAP.md:347-349` — günlük özet gerçek TLS push alıcısıyla ölçüldü, *"'gönderim kararı verildi'
değil, 240 baytlık aes128gcm gövdenin TESLİM EDİLDİĞİ"*. Özetin süpürmeden **sonra** gittiği,
alıcının push anında veritabanını sorgulamasıyla kanıtlandı (sayı 2 değil 1 idi).

### Faz 6 istisnası ve Faz 7'de kapatılması — bilerek şeffaf tutuldu

Faz 6, projedeki tek istisnadır ve ROADMAP başlığında bile gizlenmemiştir:

> `ROADMAP.md:240` — *"Faz 6 — Cron (zaman aşımı süpürmesi) ✅ TAMAMLANDI ⚠ bağımsız QA bekliyor
> (session limiti nedeniyle geliştirici kendi kodunu test etti)"*

Gerekçe ve sonucu `ROADMAP.md:274-276`'da açıkça yazılıdır: *"QA ajanı hesap oturum limitine
takıldı; doğrulamayı ana oturum kendisi yaptı. Bu, ayrı bir QA gözünün eksik olduğu anlamına
gelir — Faz 7'de bağımsız olarak tekrarlanmalı."*

Faz 7'de bu gerçekten kapatılmıştır ve kapatma biçimi de kayıtlıdır — geliştiricinin ölçümleri
kanıt sayılmamıştır:

> `ROADMAP.md:335-336` — *"Faz 6 bağımsız olarak yeniden doğrulandı (46 başlık) — geliştiricinin
> ölçümleri kanıt sayılmadı, hepsi sıfırdan tekrar çalıştırıldı."*

Yeniden doğrulama, orijinal ölçümü tekrarlamakla kalmayıp **daha katı** kontroller de eklemiştir:
`startsAt` önceliği kontrollü doğrulandı (aynı `createdAt`, uzak `startsAt` → PENDING kaldı; yani
randevuyu düşüren şey gerçekten `startsAt`'ti — `ROADMAP.md:341-342`), ve cron yetkilendirmesine
**mutasyon kanıtı** eklendi: 401 alan istekler DB'yi değiştirmedi, ardından yetkili istek aynı
randevuyu düşürdü — yani randevu gerçekten düşmeye hazırdı, onu koruyan şey 401'lerdi
(`ROADMAP.md:353-355`).

### Ölçüm sınırlarının dürüstçe kaydedilmesi

`CLAUDE.md` §0'ın "hatayı yumuşatma" yasağının belgelerdeki karşılığı, "dürüstlük notu" başlıklı
kayıtlardır. Repoda bulunanlar:

- `ROADMAP.md:104-109`: Turnstile fail-open dalı kazara doğrulandı, ama aynı kesintide Neon'a da
  ulaşılamadığı için istek 500 ile bitti — *"Kanıtlanan şey 'Turnstile kontrolü atlandı ve akış
  devam etti'dir; kesintisiz bir ortamda 201 ile bittiği AYRICA doğrulanmalı."* Bu sınır Faz 7'de
  aşıldı: **201 + randevu oluştu** (`ROADMAP.md:370-373`).
- `ROADMAP.md:234-238`: `notificationclick` düzeltmesi sonrası hedef adresin doğru açıldığı
  görüldü, ama "mevcut sekmeyi yeniden kullanma" mı yoksa `openWindow` yedeği mi çalıştığı
  **ölçülmedi**.
- `ROADMAP.md:305-308`: Faz 6'da günlük özetin gerçek bir push servisine ulaşması test **edilmedi**
  (sahte endpoint kullanıldı, çünkü ölçülmek istenen zamanlama kararıydı).
- `ROADMAP.md:388-398`: Faz 7 sonunda **3 madde "TEST EDİLEMEDİ"** olarak listelendi ve nedeni
  yazıldı (Windows bildirim merkezi tarayıcı sekmesinin dışında,
  `registration.getNotifications()` bu platformda SW bildirimlerini listelemiyor).
- `ROADMAP.md:457-460`: prod'da istemci tarafı istek sayısı test edilemedi, çünkü `next start`
  çalışan dev sunucusuyla aynı `.next` dizinini paylaşıyordu.
- `ROADMAP.md:481-483`: QA `next build`'i repo **içinde** çalıştırmadı; kullanıcının dev sunucusunu
  bozmamak için repo dışına alınmış bir kopyada derledi.
- `ROADMAP.md:366-369`: `read-limit` ölçümünün ilk denemesi **yanıltıcı negatif** verdi (126 istek
  sıralı atılınca 60 sn'lik sabit pencere sıfırlanıyordu); pencere başına hizalanıp paralel
  gruplarla tekrar ölçüldü.

Faz 7'de yapılan bir test için yamanın geri alındığı da kayıtlıdır: Turnstile doğrulama URL'si
geçici olarak cevapsız bir adrese çevrildi, *"yama raporlandı ve `git checkout` ile geri alındı,
commit EDİLMEDİ"* (`ROADMAP.md:371-372`).

Her fazın kapanış kriteri sabittir: `npm run build` ve `npx eslint src` temiz
(`ROADMAP.md:45,86,146,201,272`); Faz 7'de buna `npx tsc --noEmit` de eklendi (`ROADMAP.md:333`).

---

## 6. Bulunan ve Düzeltilen Kritik Hatalar

Aşağıdaki hataların hepsi commit geçmişinde karşılığı bulunarak doğrulanmıştır. 26 commit'in
7'si `fix:` önekli düzeltmedir.

### 6.1 Rate limit bypass — sayaç negatife düşüyordu (`728b3dc`)

**Neydi:** Kota iadesi (telafi edici `DECR`) fail-open durumunda da çalışıyordu. Upstash'e
ulaşılamadığında sayaç hiç artmamış oluyor, ama iade yine de `DECR` atıyordu; eşleşen `INCR` olmayan
`DECR`'ler sayacı negatife düşürüyordu.

**Nasıl bulundu:** Canlı gözlemle. Commit gövdesi ölçümü veriyor: *"a fail-open request can no
longer drive the counter negative (observed **-5**, granting **10+ requests/day**)"*. Aynı ölçüm
`src/lib/rate-limit.ts:53-54`'te kodun içinde de kayıtlı: *"canlı olarak gözlendi: sayaç -5, ardından
10+ talep geçti"*.

**Nasıl düzeltildi:** İki katmanlı. (a) `gunlukTalepKotasiTuket` artık sayacın **gerçekten** artıp
artmadığını bildiriyor (`KotaSonuc.artirildiMi`, `src/lib/rate-limit.ts:45-57`) ve iade yalnızca
gerçek artışlarda tetikleniyor. (b) İade, sayacı 0'ın altına indirmeyen ve `DECR` yeni anahtar
yarattıysa TTL'i yeniden uygulayan bir Lua script'inden geçiyor (`IADE_SCRIPT`,
`src/lib/rate-limit.ts:29-38`).

**İlgili önceki düzeltme (`453f1ad`):** Aynı dosyada daha önce bir atomiklik hatası kapatılmıştı —
`INCR` + `EXPIRE` tek bir atomik Lua `EVAL`'e çevrildi, çünkü düşen bir `EXPIRE` anahtarı TTL'siz
bırakıp o telefonu **sonsuza kadar** bloke edebiliyordu. Aynı commit rate limit penceresini UTC'den
Europe/Istanbul takvim gününe taşıdı ve iş kuralı reddi durumunda kotayı iade etmeye başladı.

### 6.2 Login timing leak — 45 ms'lik hesap numaralandırma sızıntısı (`728b3dc`)

**Neydi:** `sifreDogrula`, saklanan hash yoksa erken `return false` yapıyordu. Bu, scrypt maliyetini
atlıyor ve "hesap var" ile "hesap yok" arasında ölçülebilir bir yanıt süresi farkı yaratıyordu.

**Ölçülen fark:** 45 ms — commit gövdesinde (*"closing a 45ms user-enumeration timing gap"*) ve
`src/lib/password.ts:42-45`'te: *"Canlı ölçümde fark 45 ms idi — tek istekle ayırt edilebilir
düzeyde."*

**Nasıl düzeltildi:** Sabit bir sahte hash'e (`SAHTE_HASH`, `src/lib/password.ts:49-51`) karşı scrypt
**her zaman** çalıştırılıyor, sonuç sonra atılıyor. Uzunluk kontrolü bile scrypt çalıştırıldıktan
**sonra** yapılıyor ki maliyet her yolda aynı kalsın (`src/lib/password.ts:63-67`).

### 6.3 Push abonelik devri (hijack) (`728b3dc`)

**Neydi:** Bir push endpoint'i başka bir işletmeye aitse, `push/subscribe` onu yerinde
**güncelliyordu**. Bu, iki berberin anahtarlarının karışmasına açık kapı bırakıyordu.

**Nasıl düzeltildi:** Commit gövdesi: *"an endpoint owned by another business is deleted and
recreated rather than updated in place, so keys from two barbers cannot mix."*

**İlgili tasarım kuralı:** `ROADMAP.md:41` — `POST /api/push/subscribe`'da `businessId`
**gövdeden değil session'dan** alınır.

### 6.4 `23P01` yanlış hata yolunda aranıyordu (`6a9207d`)

**Neydi:** Slot çakışması `409 SLOT_TAKEN` yerine **500 INTERNAL_ERROR** dönüyordu — yani projenin
en kritik güvencesi (§3.1) kullanıcıya yanlış yansıyordu.

**Kök neden (commit gövdesi):** *"Prisma 7 wraps driver errors as P2039 with the real Postgres code
at `meta.driverAdapterError.cause.originalCode`. The previous checks looked at `error.code` /
`meta.code` / `cause.code`, none of which carry it."*

Bu, `prisma/schema.prisma:170-171`'de önceden yazılmış uyarının (`23P01` Prisma'da `P2002`'ye
eşlenmez, ham koda bakın) pratikte gerçekleşmesidir.

### 6.5 Aynı hata sınıfının ikinci örneği: `register` route'unda ölü kod (Faz 4)

**Neydi:** `register` route'u unique ihlalini `meta.target` üzerinden okuyordu; Prisma 7 + adapter'da
o alan **yok** (alan adları `meta.driverAdapterError.cause.constraint.fields` altında). Sonuç: hem
"e-posta zaten kayıtlı" (409) hem de sonekli-slug yeniden denemesi **ÖLÜ KODDU** ve ikisi de 500
veriyordu (`ROADMAP.md:138-142`).

**Nasıl düzeltildi:** `isSlotConflict` ile aynı sınıf hata olduğu tespit edilip ortak
`isUniqueViolation` yardımcısına çıkarıldı. Aynı incelemede ikinci bir hata daha bulundu: catch
içindeki yeniden deneme korumasızdı, aynı isim + aynı e-posta kombinasyonunda e-posta ihlali
dışarı kaçıyordu (`ROADMAP.md:143-144`).

### 6.6 VAPID yapılandırması veritabanını düşürüyordu (Faz 5)

**Neydi:** VAPID değişkenleri `serverEnv()`in monolitik şemasına eklenmişti. `prisma.ts` de
`serverEnv()` çağırdığı için **bozuk tek bir VAPID değeri veritabanı bağlantısını ve dolayısıyla
randevu almayı komple durduruyordu** (`ROADMAP.md:194-197`).

**Nasıl bulundu:** QA (`ROADMAP.md:194` — "QA'nın bulduğu ve düzeltilen tasarım hatası").

**Nasıl düzeltildi:** Ayrı bir `pushEnv()` şemasına çıkarıldı (`src/lib/env.ts:62-92`). Ölçüm route
seviyesinde yapıldı: `VAPID_SUBJECT` geçersizken `POST /api/appointments` **201** döndü, hata
loglandı (`ROADMAP.md:197-199`). Aynı kalıp `cronEnv()` için önden uygulandı ve Faz 6/7'de dersin
tekrarlanmadığı ölçüldü (`ROADMAP.md:297-298`, `356-358`).

### 6.7 `notificationclick` sessizce hiçbir şey yapmıyordu (`fff60d8`)

**Neydi:** `WindowClient.navigate()` yalnızca service worker'ın **kontrol ettiği** sekmelerde
çalışır; kontrolsüz bir sekmede `TypeError` ile reddedilir. Worker kaydedilmeden önce açılmış her
sekme ilk yenilemeye kadar kontrolsüzdür — yani **ilk kurulumdan hemen sonraki tıklama sessizce
hiçbir şey yapmıyordu.**

**Nasıl bulundu:** Gerçek Chrome + gerçek FCM ile; commit gövdesi: *"düzeltme öncesi tıklamada
sekmenin `controller: false` olduğu görüldü."*

**Nasıl düzeltildi:** Reddediş yakalanıp loglanıyor ve `clients.openWindow()` yedeğine düşülüyor.
Düzeltmeden sonraki tıklama `/dashboard/appointments?scope=pending` hedefine ulaştı.

### 6.8 Faz 2/3 arası kırık bağlantı (Faz 4)

**Neydi:** `confirm` endpoint'i WhatsApp mesajına `/r/<token>` koyuyordu ama **öyle bir route hiç
var olmadı** — berberin müşteriye gönderdiği link 404'tü (`ROADMAP.md:133-136`).

**Nasıl düzeltildi:** Artık `/[businessSlug]/appointment/[token]` üretiliyor ve linkin açıldığı
tarayıcıda doğrulandı.

### 6.9 Prisma 7 build hatası — deploy 31 hatayla düştü (`e387cdd`)

**Neydi:** İlk production deploy'u tip kontrolünde **31 hatayla** düştü. Prisma 7 kurulum sırasında
Client'ı artık kendiliğinden üretmiyor; temiz CI kurulumunda `@prisma/client` hiçbir tip export
etmiyordu (`has no exported member 'PrismaClient'`, `'Appointment'`, `'WorkingHours'` vb.).

**Neden yerelde görünmedi:** Commit gövdesi: *"Yerelde `node_modules`'daki üretilmiş client sayesinde
görünmüyordu."*

**Nasıl düzeltildi:** `build` script'i `prisma generate && next build` oldu (`package.json:7`).
`postinstall` **değil** — gerekçe commit gövdesinde: *"Vercel node_modules cache'i isabet ettiğinde
postinstall atlanır"* (build adımı atlanmaz).

### 6.10 Emoji encoding — `wa.me` yönlendirmesi 📅 ✂️ 📍 karakterlerini bozuyordu (`32612e1`)

**Neydi:** Berberin hazır mesajında emojiler `�` olarak görünüyordu.

**Nasıl bulundu:** Faz 8 smoke test'inde, production'da, **bayt düzeyinde ölçülerek**. Commit
gövdesindeki ölçüm:

```
istek:  https://wa.me/905559998877?text=%F0%9F%93%85%20test%20%E2%9C%82%EF%B8%8F
yanıt:  Location: https://api.whatsapp.com/send/?...&text=%EF%BF%BD+test+%EF%BF%BD
```

Yani `wa.me` isteği 302 ile `api.whatsapp.com`'a yönlendirirken `text` parametresindeki BMP dışı
karakterleri U+FFFD'ye çeviriyordu. Kaynak dosyanın baytları doğru UTF-8'di; bozulma tamamen
yönlendirmede oluşuyordu. Türkçe karakterler her iki yolda da sağlamdı.

**Not — teşhis değişti:** Faz 7 QA'sı bunu `(f)` gözlemi olarak bildirmiş ve
*"BİZİM HATAMIZ DEĞİL — kapandı"* şeklinde karara bağlanmıştı (`ROADMAP.md:426-429`). Faz 8'de aynı
sorun ölçülerek **düzeltilebilir** olduğu görüldü: aynı adres doğrudan çağrıldığında yönlendirme
hiç olmuyor (200) ve emoji bozulmadan geçiyor.

**Nasıl düzeltildi:** `src/lib/whatsapp.ts:63` artık doğrudan
`https://api.whatsapp.com/send/?phone=…&text=…&type=phone_number&app_absent=0` üretiyor.
Davranış değişmedi — link yine yeni sekmede açılıyor, mesajı berber manuel gönderiyor, WhatsApp
Business API yok. Gerekçe `PROJECT_SPEC.md:143-151`'e kaydedildi.

### 6.11 Metadata düzeltmelerinin kendi ürettiği hata (Faz 7, `f93e528`)

**Neydi:** Var olmayan slug sayfasının başlığı sunucu HTML'inde "Sayfa bulunamadı", hydration
sonrası "İşletme bulunamadı" oluyordu — iki kaynak iki farklı metin veriyordu (`ROADMAP.md:436-438`).

**Nasıl bulundu:** `qa-metadata` oturumunun 24 başlıklık turunda; iki FAIL'in ikisi de düzeltmelerin
kendisinden çıktı (`ROADMAP.md:433-434`).

**Nasıl düzeltildi:** `generateMetadata` artık **üç** durumu ayırıyor: `var` → işletme adı, `yok` →
`not-found.tsx` ile paylaşılan sabit (`BULUNAMADI_BASLIGI`), `bilinmiyor` → başlık vermez, kök
varsayılan miras alınır. Üçüncü dal, API kesintisinde çalışan bir randevu ekranının üstünde
"İşletme bulunamadı" yazması sorununu da kapattı (`ROADMAP.md:439-442`).

**Bu düzeltmeden çıkan ve kabul edilen sınır:** Next.js 16.3.1'de `notFound()` render'ı root layout
**dışında** oluşuyor; var olmayan işletme linkinde ilk HTML'de `lang`/font sınıfı hydration'a kadar
eksik kalıyor. Framework davranışı olduğu **üç ayrı yöntemle** doğrulandı ve düzeltme girişimi
yapılmayacağı karara bağlandı; denenen ve faydasız olduğu kanıtlanan yollar da ileride tekrar
denenmesin diye yazıldı (`ROADMAP.md:444-456`).

### 6.12 Diğer düzeltmeler

- `453f1ad`: Paylaşılan `withTimeout()` yardımcısı eklendi; Prisma'ya bağlantı ve statement
  timeout'ları tanımlandı (`CLAUDE.md` §2: tüm dış çağrılarda timeout zorunlu).
- `f93e528`: Var olmayan işletme slug'ı HTTP 200 dönüyordu; artık sunucu tarafında doğrulanıp
  `notFound()` çağrılıyor ve Türkçe `src/app/not-found.tsx` gösteriliyor. **API'ye
  ulaşılamadığında 404 verilmez** — geçici bir kesinti kalıcı bir "dükkan yok" mesajına
  dönüşmemeli (`ROADMAP.md:406-410`).
- `9556562`: Geçersiz `publicToken`'da 404 **değil**, `robots: { index: false }` taşıyan 200
  yanıtı. Ayrım `PROJECT_SPEC.md:136-142`'de: olmayan slug gerçekten yok olan bir adrestir; geçersiz
  token ise "böyle bir sayfa yok" değil "böyle bir kayıt yok" anlamına gelir.
- `f93e528`: create-next-app kalıntıları temizlendi — kök sayfa Türkçe minimal iniş sayfasıyla
  değiştirildi, referanssız 5 SVG silindi (`ROADMAP.md:492-504`).

---

## 7. Bilinçli Kapsam Dışı Bırakılanlar

`PROJECT_SPEC.md:52-59` "v1 Kapsam DIŞI (bilinçli olarak yapılmayacak)" başlığı altındaki altı madde:

| Kapsam dışı | Gerekçe | Kaynak |
| --- | --- | --- |
| **Yapay zeka / AI** önerisi, tahmin, otomasyon | *"hiçbir şekilde"* | `PROJECT_SPEC.md:54` |
| **WhatsApp Business API** (resmi, otomatik gönderim) | ek maliyet yok; mesaj manuel gönderilir | `PROJECT_SPEC.md:29,55` |
| **Online ödeme / tahsilat** | fiyat yalnızca bilgi amaçlıdır | `PROJECT_SPEC.md:17,56` |
| **Kasa / adisyon / paket satışı** | — | `PROJECT_SPEC.md:57` |
| **SMS ile bildirim veya doğrulama** | maliyet | `PROJECT_SPEC.md:49,58` |
| **Reklam entegrasyonu** | *"yeterli trafik oluşana kadar anlamsız, v2+ değerlendirilecek"* | `PROJECT_SPEC.md:59` |

**AI yasağı iki ayrı yerde tekrarlanmıştır:** `PROJECT_SPEC.md:8` (*"v1'de yapay zeka YOK"*) ve
`CLAUDE.md` §1 — burada ayrıca ileriye dönük bir kapı da kapatılmıştır:
*"No AI/LLM integration in v1 — this is explicitly out of scope, **do not add AI features 'for later'
hooks**"*. `.claude/agents/fullstack-developer.md:8-9` aynı yasağı geliştirici rolüne de yazar.

**SMS'in kapsam dışılığı iki gerekçeyle desteklenmiştir:** kimlik doğrulama tarafında
`PROJECT_SPEC.md:49` (*"SMS OTP YOK (maliyet)"*) ve bot doğrulaması tarafında `PROJECT_SPEC.md:46`
(*"Cloudflare Turnstile — ücretsiz, SMS/OTP maliyeti yok"*). Yani SMS yerine geçen çözüm
belirlenmiş, boşluk bırakılmamıştır.

**Şema seviyesinde de uygulanmıştır.** `prisma/schema.prisma:2-4`, kapsam dışı maddelerin
modellenmediğini satır referanslarıyla yazar: *"owner/staff hiyerarşisi (63-64), online ödeme
(56-57), SMS (58), AI (54) YOK."*

**Sızıntı kontrolü yapılmıştır.** Faz 7'de kapsam dışı taraması çalıştırıldı ve temiz çıktı
(`ROADMAP.md:384-386`): *"AI/LLM, WhatsApp Business API, ödeme, SMS, kasa/adisyon, reklam,
owner/staff — hiçbiri `package.json`'da veya `src/`'de yok."* Bu analiz sırasında `package.json`
bağımsız olarak incelendi: 10 runtime bağımlılığın hiçbiri AI, ödeme, SMS veya WhatsApp API
istemcisi değildir.

Kapsam dışı bırakma sadece uygulamada değil, **pazarlama yüzeyinde de** uygulanmıştır: kök
`/` sayfasının kapsamı bilinçli olarak dar tutuldu — başlık + tek cümle + "Ücretsiz Kayıt Ol" +
"Giriş Yap"; hero görsel, özellik listesi ve fiyatlandırma **kasten yok**, çünkü spec'te olmayan bir
pazarlama yüzeyi büyütülmeyecek (`ROADMAP.md:497-500`).

---

## 8. Bilinen Sınırlar ve v2 Adayları

### 8.1 Login brute-force koruması + "şifremi unuttum" — birlikte ertelendi

Bu, repodaki en ayrıntılı gerekçelendirilmiş erteleme kararıdır (`PROJECT_SPEC.md:97-101`,
`ROADMAP.md:159-166`). İkisi **tek bir işte** ele alınmalıdır, çünkü biri olmadan diğeri eksik veya
riskli kalır:

- Yalnızca **brute-force koruması** eklenirse, kilitlenen veya şifresini unutan berberin kendi
  kendine kurtulma yolu olmaz — `ROADMAP.md:164` ayrıca not ediyor: *"(destek kanalı da yok)"*.
- Yalnızca **şifre sıfırlama** eklenirse, sıfırlama e-postası saldırganın deneyebileceği **yeni bir
  saldırı yüzeyi** açar ve giriş denemeleri hâlâ sınırsız kalır.

Karar 2026-08-16'da alınmıştır. Bugünkü durum ölçülmüştür ve gizlenmemiştir:

> `ROADMAP.md:508-511` — *"**v1 canlıya çıkarken bilinen ve KASITLI risk:** login brute-force
> koruması ve şifre sıfırlama YOK. QA `POST /api/auth/login`'in bugün sınırsız denemeye açık
> olduğunu ölçtü. FAIL sayılmadı çünkü bilinçli bir karar, ama canlıda duran bir risktir."*

Not: Bu boşluk yalnızca `POST /api/auth/login`'dedir. Üç public GET route'u IP bazlı 120/dk limitiyle
korunmaktadır (`src/lib/read-limit.ts`, Faz 7'de ilk kez tetiklendi — `ROADMAP.md:366-369`) ve
randevu oluşturma telefon başına günlük 5 talep limitiyle korunmaktadır
(`src/lib/rate-limit.ts:9`).

### 8.2 Owner / Staff hiyerarşisi

`PROJECT_SPEC.md:63-64`: bir işletme sahibinin birden fazla personeli/koltuğu yönetmesi. v1'de her
berber kendi bağımsız `Business` kaydıdır; *"talep gelirse v2'de eklenecek"* — yani erteleme
gerekçesi, doğrulanmamış talebe yatırım yapmamaktır. Şema tarafında da bilinçli olarak
modellenmemiştir (`prisma/schema.prisma:43`).

### 8.3 Diğer v2 maddeleri

- **Toplu WhatsApp onay gönderimi** — günün tüm onaylarını sırayla açan kısayol
  (`PROJECT_SPEC.md:65`).
- **Reklam / freemium ücretli katman modeli** (`PROJECT_SPEC.md:66`); reklam ayrıca kapsam dışı
  listesinde *"yeterli trafik oluşana kadar anlamsız"* gerekçesiyle geçer (`PROJECT_SPEC.md:59`).
- **Magic link alternatifi** — `PROJECT_SPEC.md:49`'da bir seçenek olarak geçiyor ama
  uygulanmamıştır; `ROADMAP.md:156-157` bunu şifre sıfırlamayla birlikte "hâlâ yapılmayanlar"
  altında listeliyor. Şema bu ihtimali korumuştur: `Business.passwordHash` nullable'dır ve gerekçesi
  yazılıdır — *"magic link ile giren hesapta şifre olmayabilir"* (`prisma/schema.prisma:57-59`).

### 8.4 Kabul edilmiş teknik sınırlar (v2 adayı değil, kapanmış kararlar)

`ROADMAP.md:400-429`, Faz 7'de QA'nın bildirdiği altı gözlemden dördünün **dokunulmayacak** olarak
karara bağlandığını ve gerekçelerini kaydeder — belge bunların *"açık iş DEĞİL, KAPANMIŞ kararlar"*
olduğunu açıkça belirtir:

- **(b)** Randevu detay sayfasında `[businessSlug]` segmenti doğrulanmıyor; başka işletmenin slug'ı
  ile geçerli token çalışıyor. Güvenlik açığı değildir: yetki token'ın kendisidir
  (`PROJECT_SPEC.md:42`), token tahmin edilemez ve ekranda randevunun **gerçek sahibi** işletmenin
  adı yazar.
- **(c)** Panel sekme değişimi URL'e yansımıyor; kozmetik, spec sekme durumunun kalıcılığını
  istemiyor.
- **(e)** `read-limit`, `x-forwarded-for` başlığı yokken uygulanmıyor. Kodda bilinçli ve
  yorumlanmış: Vercel arkasında bu başlık daima vardır.
- **Next.js 16.3.1 `notFound()` sınırı** (§6.11): kabul edilen sınır, düzeltme girişimi
  yapılmayacak.

Ayrıca hâlâ **göz ile doğrulanmamış iki madde** kayıtlıdır (`ROADMAP.md:577-583`): günlük özet
bildiriminin ekranda görülmesi ve "Yeni randevu talebi" push'unun bu oturumda yeniden ölçümü. İkisi
için de sunucudan gerçek FCM'e teslimatın daha önce ölçüldüğü not edilmiştir.

---

## 9. Bizi Farklılaştıran Unsurlar

Bu bölüm yorum içermez; yalnızca repoda belgelenmiş, doğrulanabilir farklar listelenmiştir.

**1. Ücretsiz altyapı — her katmanda ücretsiz kademe.** Neon, Upstash (Redis + QStash), Cloudflare
Turnstile, Web Push (VAPID) ve Vercel free tier. Ücretli push servisi ve SMS sağlayıcısı `CLAUDE.md`
§1 ile açıkça yasaklanmıştır (*"no Firebase, no paid push service"*). Ürünün kendisi de ücretsiz
olarak tanımlanmıştır (`PROJECT_SPEC.md:8`, `README.md:3`).

> **Rakip fiyatlandırması (aylık 400–500 TL) repoda kayıtlı DEĞİLDİR.** Depodaki tüm Markdown
> dosyaları ve commit gövdeleri tarandı; rakip, pazar veya fiyat karşılaştırmasına dair hiçbir kayıt
> yoktur. Bu rakam bu rapora bir olgu olarak alınmamıştır.

**2. WhatsApp Business API maliyetinden kaçınan mimari.** Mesaj gönderimi bir dış servise değil,
berberin kendi WhatsApp'ına devredilmiştir (`PROJECT_SPEC.md:28-29`). Kodda bunun karşılığı
`src/lib/whatsapp.ts`'in yalnızca bir URL string'i döndürmesi ve hiçbir ağ çağrısı yapmamasıdır
(`src/lib/whatsapp.ts:6-9`); Faz 7 QA'sı bunu bağımsız olarak taradı (`ROADMAP.md:386`).

**3. Çakışma koruması veritabanı seviyesinde garanti edilir, uygulama katmanında değil.**
`Appointment_no_overlap_excl` bir `EXCLUDE USING gist` kısıtıdır ve **aralık** çakışmasını engeller
(`prisma/migrations/20260814000000_init/migration.sql`). Ölçülmüş sonuç: 4 eşzamanlı istek → **tam
1×201 / 3×409** (`ROADMAP.md:379`); iki yönlü kontrol: EXPIRED randevunun saati yazılabildi,
CONFIRMED'ınki `23P01` ile reddedildi (`ROADMAP.md:344-346`); canlı production'da da slotu tuttuğu
doğrulandı (`ROADMAP.md:555-556`).

**4. Zaman aşımı sabit saat değil, işletmenin açık dakikalarıdır.** Ölçülmüş sonuç
(`ROADMAP.md:338-340`): gece 02:00 talebi 07:59Z'de PENDING, 08:00Z'de EXPIRED; Cumartesi 17:30
talebi kapalı Pazar boyunca ilerlemedi, Pazartesi 07:29Z PENDING / 07:30Z EXPIRED. İşletmeler arası
izolasyon da ölçüldü: 12:00 açan B işletmesi kendi takvimine göre değerlendirildi
(`ROADMAP.md:286-287`).

**5. Müşteri uygulama indirmez, hesap açmaz.** Mobil web üzerinden ad + telefon ile randevu
(`PROJECT_SPEC.md:22`, `:50`). 390px mobil düzende yatay taşma olmadığı ölçüldü
(`ROADMAP.md:382`).

**6. Public linkler tahmin edilemez.** 32 bayt = 256 bit entropi, `base64url` ile 43 karakter
(`src/lib/tokens.ts:10-13`). Ölçüm: *"token'lar 43 karakter `base64url` ve ardışık üretimde
ilişkisiz"* (`ROADMAP.md:380-381`); production'da da 43 karakter doğrulandı (`ROADMAP.md:547`).

**7. Altyapı kesintisi dükkanın randevu almasını durdurmaz.** Fail-open politikası
(`PROJECT_SPEC.md:75-79`) kesintisiz bir ortamda ölçüldü: Turnstile doğrulama URL'si cevapsız bir
adrese çevrildiğinde istek **201 döndü ve randevu oluştu** (`ROADMAP.md:370-373`).

**8. Push yapılandırma hatası randevu almayı durdurmaz.** Üç ayrı env şeması
(`src/lib/env.ts:34,79,113`). Ölçüm: `VAPID_SUBJECT` geçersizken `POST /api/appointments` 201 döndü
(`ROADMAP.md:197-199`); `CRON_SECRET` ortamdan tamamen kaldırıldığında `serverEnv()`, `pushEnv()` ve
`prisma.business.count()` çalışmaya devam etti, yalnızca `cronEnv()` fırlattı (`ROADMAP.md:356-358`).

**9. Doğrulama mock'a değil canlı servislere karşı yapılmıştır.** Canlı Neon, canlı Upstash, gerçek
FCM, gerçek Turnstile, gerçek QStash, gerçek Chrome — hepsi §5'te satır referanslarıyla listelidir.
Faz 7'de ~100 başlıkta **0 FAIL** (`ROADMAP.md:332`); son turda **23/23 PASS** (`ROADMAP.md:466`).

**10. Kararlar ve ölçüm sınırları yazılıdır.** `PROJECT_SPEC.md`'nin "Onaylanan Çıkarımlar" bölümü
16 kararı tarihiyle kayıt altına alır (satır 68-151); `ROADMAP.md` kapatılan kararların gerekçesini
*"ileride tekrar sorulmasın diye"* saklar (`ROADMAP.md:403-404`) ve test edilemeyen maddeleri ayrı
başlık altında listeler (`ROADMAP.md:388-398`).

**11. Kapsam disiplini ölçülmüştür.** Kapsam dışı sızıntı taraması temiz
(`ROADMAP.md:384-386`); 200 satır sınırı fiilen tutulmuştur (en uzun dosya 196 satır,
`src/components/dashboard/shell.tsx`); 26 commit'in tamamı conventional commit biçimindedir
(`CLAUDE.md` §2).

---

## Ek: Repoda karşılığı bulunamayan iddialar

Bu rapor hazırlanırken doğrulanamayan ve bu nedenle olgu olarak yazılmayan noktalar:

| İddia | Durum |
| --- | --- |
| Rakiplerin aylık 400–500 TL ücret aldığı | **Repoda kaynağı yok.** Hiçbir belgede rakip/fiyat karşılaştırması geçmiyor. Bölüm 9'da olgu olarak kullanılmadı. |
| WhatsApp kararının KVKK / 6563 sayılı kanun gerekçesi | **Repoda kayıtlı değil.** Yazılı gerekçe yalnızca maliyet ve kapsamdır (`PROJECT_SPEC.md:29,55`). §3.2'de ayrı ve işaretlenmiş bir cümle olarak verildi. |
| Tailwind CSS 4 seçiminin gerekçesi | **Repoda kayıtlı değil.** Yalnızca varlığı belgelenmiş (`package.json:23,33`, `README.md:37`). |
| Toplam QA senaryo sayısı (tek rakam) | ROADMAP tek bir toplam vermiyor; tur tur sayılar §5'teki tabloda ayrı ayrı listelendi, uydurma bir toplam yazılmadı. |
