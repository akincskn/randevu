# Randevu — Berber/Kuaför Randevu Sistemi

Berber ve kuaförler için ücretsiz, basit bir randevu sistemi. Müşteri uygulama indirmeden,
mobil tarayıcıdan işletmenin public linkinden randevu talebi oluşturur; berber kendi
panelinden talebi onaylar ve hazır yazılmış bir `wa.me` mesajıyla müşteriye bilgi verir.

Hedef kitle: şu an hiçbir dijital sistem kullanmayan, randevuyu deftere yazan esnaf.
v1'de yapay zeka entegrasyonu, online ödeme ve WhatsApp Business API **yoktur**.

Ürün kapsamının tek doğruluk kaynağı [`PROJECT_SPEC.md`](PROJECT_SPEC.md)'dir.

## Özellikler (v1)

- **İşletme kaydı** — isim, telefon, opsiyonel adres, sektör (BERBER / KUAFOR)
- **Hizmet yönetimi** — isim, süre, opsiyonel fiyat; randevusu olan hizmet silinmez, pasife alınır
- **Çalışma saatleri** — haftalık tekrar eden program + tekil gün istisnaları (bayram, izin)
- **Public randevu akışı** — hizmet seç → uygun slotu gör → ad + telefon ile talep oluştur (`PENDING`)
- **Onay akışı** — berber panelden onaylar (`CONFIRMED`), çıkan `wa.me` linkiyle müşteriye yazar
- **Müşteri detay ekranı** — tahmin edilemez `publicToken` ile randevu detayı ve iptal
- **Çalışma saatine duyarlı zaman aşımı** — bekleyen randevu, işletmenin AÇIK olduğu 120 dakika
  içinde onaylanmazsa `EXPIRED` olur; kapalıyken sayaç durur
- **Web Push bildirimi** — yeni talep anında + günlük "N bekleyen randevunuz var" özeti
  (VAPID, Firebase yok)
- **Slot çakışma koruması** — veritabanı seviyesinde exclusion constraint, uygulama kontrolü değil
- **Bot ve suistimal koruması** — Cloudflare Turnstile + Upstash Redis rate limit

## Teknoloji

| Katman | Seçim |
| --- | --- |
| Framework | Next.js 16.3.1 (App Router), React 19, TypeScript strict |
| Veritabanı | Neon PostgreSQL + Prisma 7 |
| Cache / rate limit | Upstash Redis |
| Zamanlama (cron) | Upstash QStash |
| Bildirim | Web Push API (VAPID) |
| Bot koruması | Cloudflare Turnstile |
| Stil | Tailwind CSS 4 |
| Deploy | Vercel |

## Kurulum

Gereksinim: Node.js 20+ ve erişilebilir bir PostgreSQL veritabanı (Neon önerilir).

```bash
git clone https://github.com/akincskn/randevu.git
cd randevu
npm install
```

Proje kökünde `.env` dosyası oluşturun (aşağıdaki tabloya bakın), ardından şemayı uygulayın:

```bash
npx prisma migrate deploy   # mevcut migration'ları uygular
npx prisma generate         # Prisma Client üretir
npm run dev                 # http://localhost:3000
```

## Ortam değişkenleri

`.env` dosyası `.gitignore`'dadır ve **asla commit edilmez**. Doğrulama tek noktada,
`src/lib/env.ts` içinde Zod ile yapılır; eksik bir değişken sessizce `undefined` akmaz.

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | evet | Neon **pooled** bağlantı dizesi (uygulama çalışma zamanı) |
| `DIRECT_URL` | evet | Neon **direct** bağlantı dizesi (Prisma migration) |
| `UPSTASH_REDIS_REST_URL` | evet | Upstash Redis REST endpoint'i |
| `UPSTASH_REDIS_REST_TOKEN` | evet | Upstash Redis REST token'ı |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | evet | Turnstile site anahtarı (istemcide görünür) |
| `TURNSTILE_SECRET_KEY` | evet | Turnstile gizli anahtarı |
| `SESSION_SECRET` | evet | Oturum çerezini imzalar, **en az 32 karakter** |
| `CRON_SECRET` | cron için | Süpürme endpoint'ini korur, **en az 32 karakter** |
| `VAPID_PUBLIC_KEY` | push için | `web-push` `generateVAPIDKeys()` çıktısı |
| `VAPID_PRIVATE_KEY` | push için | Aynı çiftin gizli tarafı — değişirse tüm abonelikler geçersizleşir |
| `VAPID_SUBJECT` | push için | `mailto:` veya `https://` ile başlamalı (VAPID spesifikasyonu) |

Rastgele sır üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

VAPID anahtar çifti için:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Push ve cron değişkenleri **ayrı** şemalarda doğrulanır: bozuk bir VAPID değeri veritabanı
bağlantısını düşürmesin, yani bir bildirim yapılandırma hatası randevu almayı durdurmasın diye.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Prodüksiyon derlemesi |
| `npm start` | Derlenmiş uygulamayı çalıştırır |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Yeni migration üretir ve uygular (geliştirme) |
| `npx prisma studio` | Veritabanı tarayıcısı |

## Deploy notları (Vercel)

1. Yukarıdaki tüm ortam değişkenlerini Vercel proje ayarlarına ekleyin.
2. Zaman aşımı süpürmesi ve günlük özet **Vercel Cron ile çalışmaz** (ücretsiz plan günde 1
   tetikleme verir). Upstash QStash'te 15 dakikalık bir zamanlama kaydedin:

   ```bash
   curl -X POST "https://qstash.upstash.io/v2/schedules/https://<alan-adi>/api/cron/expire-appointments" \
     -H "Authorization: Bearer $QSTASH_TOKEN" \
     -H "Upstash-Cron: */15 * * * *" \
     -H "Upstash-Forward-Authorization: Bearer $CRON_SECRET"
   ```

3. İlk turdan sonra loglarda `[cron] zaman aşımı süpürmesi tamamlandı` satırını doğrulayın.

## Proje dokümantasyonu

| Dosya | İçerik |
| --- | --- |
| [`PROJECT_SPEC.md`](PROJECT_SPEC.md) | Ürün kapsamı, v1/v2 sınırı, onaylanan çıkarımlar |
| [`STRUCTURE.md`](STRUCTURE.md) | Zorunlu klasör düzeni |
| [`ROADMAP.md`](ROADMAP.md) | Faz faz uygulama planı ve tamamlanma durumu |
| [`CLAUDE.md`](CLAUDE.md) | Kod değişiklikleri için bağlayıcı mühendislik kuralları |
| `prisma/schema.prisma` | Veri modelinin doğruluk kaynağı |
