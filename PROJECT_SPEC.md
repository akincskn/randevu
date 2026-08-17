# Proje Spesifikasyonu: Berber/Kuaför Randevu Sistemi

Bu belge, konuşmalarımızda netleştirdiğimiz tüm kararların tek doğruluk kaynağıdır (source of truth).
Burada yazmayan hiçbir özellik varsayılmamalı — belirsizlik varsa kod yazılmadan önce sorulmalı.

## Ürün özeti

Berber/kuaförler için ücretsiz, basit, hatasız randevu sistemi. v1'de yapay zeka YOK.
Hedef ilk kullanıcı kitlesi: şu an hiçbir dijital sistem kullanmayan (deftere/hafızaya yazan) esnaf.
Model: her berber kendi bağımsız işletmesi (owner/staff hiyerarşisi yok — bkz. "v2" bölümü).

## v1 Kapsamı (yapılacaklar)

### İşletme (Business)
- Kayıt: isim, telefon (WhatsApp onay mesajlarının gönderileceği numara), opsiyonel adres, sektör
  (BERBER / KUAFOR — ileride genişletilebilir enum)
- Hizmet listesi: isim, süre (dakika), opsiyonel fiyat (bilgi amaçlı, online ödeme YOK)
- Çalışma saatleri: haftalık tekrar eden (gün bazlı açık/kapalı + saat aralığı)
- Çalışma saati istisnaları: tekil gün bazlı kapatma/özel saat (bayram, izin günü)

### Randevu akışı
1. Müşteri, işletmenin public linkinden (uygulama indirmeden, mobil web) hizmet seçer, uygun saati görür,
   adı + telefon numarasıyla randevu talebi oluşturur. Randevu durumu: `PENDING`.
2. Berber panelinde bekleyen randevuları görür (belirgin, gözden kaçmaz rozet/badge ile).
3. Berber "onayla" dediğinde:
   - Randevu durumu `CONFIRMED` olur.
   - Ekranda bir `wa.me` linki belirir (randevu detaylarının önceden yazıldığı hazır mesaj metniyle).
   - Berber linke tıklar → kendi WhatsApp'ı açılır → mesajı gönderir. Bu adım MANUEL, otomatik değil.
     WhatsApp Business API kullanılmıyor, resmi entegrasyon yok, ek maliyet yok.
4. Müşteri, kendisine gelen linke tıkladığında randevu detay ekranını görür (saat, hizmet, adres).

### Bekleyen randevu zaman aşımı (kritik karar)
- Sabit "2 saat sonra otomatik iptal" KURALI YOK (gece verilen randevuları haksız cezalandırır).
- Zaman aşımı, işletmenin çalışma saatlerine göre hesaplanır: dükkan açıldıktan sonraki belirli bir süre
  (örn. ilk 1-2 saat) içinde onaylanmazsa iptal edilir. Kapalı saatlerde geçen süre sayılmaz.
- Berbere Web Push bildirimi (VAPID, ücretsiz, Firebase yok) gönderilir:
  - Yeni randevu talebi geldiğinde anında.
  - Günlük özet: "N bekleyen randevunuz var" (dükkan açılışına yakın bir saatte).
- Panelde bekleyen randevu sayısı her zaman görünür bir rozet ile gösterilir.

### Güvenlik / kötüye kullanım koruması
- Randevu detay/iptal linkleri sıralı ID değil, kriptografik olarak rastgele token kullanır.
- Slot çakışması (iki müşterinin aynı saati alması) veritabanı seviyesinde engellenir
  (unique constraint + transaction, sadece UI kontrolü değil).
- Aynı telefon numarasından günlük randevu talebi sayısı sınırlıdır (rate limiting, Upstash Redis).
- Basit bot/insan doğrulaması (örn. Cloudflare Turnstile) — ücretsiz, SMS/OTP maliyeti yok.

### Kimlik doğrulama
- Berber tarafı: basit email/şifre veya magic link. SMS OTP YOK (maliyet).
- Müşteri tarafı: hesap yok, sadece ad + telefon numarası ile randevu talebi.

## v1 Kapsam DIŞI (bilinçli olarak yapılmayacak)

- Yapay zeka / AI önerisi, tahmin, otomasyon — hiçbir şekilde.
- WhatsApp Business API entegrasyonu (resmi, otomatik mesaj gönderimi).
- Online ödeme / online tahsilat.
- Kasa / adisyon / paket satışı yönetimi.
- SMS ile bildirim veya doğrulama.
- Reklam entegrasyonu (yeterli trafik oluşana kadar anlamsız, v2+ değerlendirilecek).

## v2 / Ertelenen kararlar (şimdi implement edilmeyecek, sadece not)

- Owner/Staff hiyerarşisi: bir işletme sahibinin birden fazla personeli/koltuğu yönetmesi. v1'de her
  berber kendi bağımsız "Business" kaydı — talep gelirse v2'de eklenecek.
- Toplu WhatsApp onay gönderimi (günün tüm onaylarını sırayla açan kısayol).
- Reklam / freemium ücretli katman modeli.

## Onaylanan Çıkarımlar (spec'te lafzen yok, kullanıcı onayıyla eklendi)

- Business.slug — public booking link için gerekli, 2026-08-14 onaylandı
- Business.email, Business.passwordHash — spec satır 49'daki "email/şifre veya magic link"
  ifadesinin doğal sonucu, 2026-08-14 onaylandı
- AppointmentStatus enum genişletmesi (EXPIRED, COMPLETED, NO_SHOW) — zaman aşımı ve
  slot-çakışma mekanizmasının önkoşulu, 2026-08-14 onaylandı
- Fail-open dış servis politikası — Upstash veya Cloudflare Turnstile'a ULAŞILAMAZSA
  ilgili kontrol atlanır ve loglanır; randevu akışı durmaz. Bir altyapı kesintisinin
  dükkanın online randevusunu tamamen kapatması, kötüye kullanım riskinden daha
  maliyetli görüldü. Cloudflare'in açık "bot" kararı ise ret olarak uygulanmaya devam
  eder (ulaşılamama ≠ reddedilme). 503 RATE_LIMITED yanıtı kaldırıldı. 2026-08-15 onaylandı
- Rate limit penceresi Europe/Istanbul takvim gününe göre hesaplanır, UTC'ye göre değil —
  aksi halde pencere yerel saatle 03:00'te sıfırlanırdı. 2026-08-15 onaylandı
- Geçmiş saate randevu engeli ve çalışma saati kontrolünün POST'ta sunucu tarafında
  tekrarlanması — savunmacı programlama gereği, istemciden gelen saat güvenilmez kabul
  edilir. 2026-08-15 onaylandı
- `GET /api/appointments/token/[token]` yanıtı iç `Appointment.id` alanını da döndürür —
  müşteri detay ekranındaki iptal butonu `PATCH /api/appointments/[id]/cancel` çağırıyor ve
  o endpoint id'yi path'te bekliyor. Bu yanıtı yalnızca `publicToken`'ı bilen alır ve iptal
  aynı token'ı ayrıca doğrular; id tek başına hiçbir yetki taşımaz, `publicToken` id'den
  türetilebilir değildir (spec satır 42 korunur). 2026-08-15 onaylandı
- `Service.isActive` (boolean, varsayılan true) — spec satır 17'de lafzen yok. Gerekçe:
  `Appointment.service` ilişkisi `onDelete: Restrict` olduğu için bir kez randevu almış
  hizmet SİLİNEMEZ (geçmiş randevu hangi hizmet için alındığını kaybetmemeli). Berberin
  artık sunmadığı bir hizmeti listeden çıkarmasının başka yolu yoktu. Pasif hizmet public
  booking sayfasında ve slot üretecinde görünmez; geçmiş randevuları olduğu gibi kalır.
  Randevusu olan hizmeti silme denemesi 409 ile reddedilir ve pasife alma önerilir.
  2026-08-16 onaylandı
- Login brute-force koruması (rate limit/backoff) ve "şifremi unuttum" akışı v1'de YOK,
  bilinçli olarak ertelendi; v2'de BİRLİKTE ele alınacak — biri olmadan diğeri eksik/riskli
  kalıyor. Yalnızca brute-force koruması eklenirse kilitlenen berberin kendini kurtarma yolu
  olmaz; yalnızca şifre sıfırlama eklenirse giriş denemeleri sınırsız kalırken yeni bir
  saldırı yüzeyi açılır. 2026-08-16 onaylandı
- **Zaman aşımı bütçesi 120 dakikadır ve AÇIK geçen dakikalar BİRİKİR** — spec satır 34'teki
  "örn. ilk 1-2 saat" bağlayıcı bir sayı vermiyordu. `createdAt`'ten itibaren yalnızca
  işletmenin açık olduğu dakikalar sayılır; kapalıyken sayaç DURUR ve ertesi açılışta
  kaldığı yerden devam eder (satır 35'in birebir karşılığı). Böylece her talebe eşit
  120 dakika tanınır: gece 02:00'de gelen talep 09:00 açılışlı bir dükkanda 11:00'de,
  17:30'da gelen talep ertesi gün açılıştan 90 dakika sonra düşer. 2026-08-16 onaylandı
- **Randevu SAATİ (`startsAt`) geçtiğinde randevu, 120 dakikası dolmasa bile EXPIRED olur** —
  iki koşuldan hangisi önce gerçekleşirse o uygulanır. Spec bu durumdan hiç bahsetmiyordu.
  Gerekçe: geçmiş bir saati onaylamak anlamsızdır ve o slot `Appointment_no_overlap_excl`
  gereği boşuna dolu tutulur. 2026-08-16 onaylandı
- **Zaman aşımı son tarihi SAKLANMAZ, süpürme anında hesaplanır** — `Appointment` üzerine
  `expiresAt` kolonu EKLENMEDİ. Gerekçe: berber çalışma saatlerini veya bir istisna gününü
  randevu oluşturulduktan SONRA değiştirebilir; saklanan bir son tarih o anda eskir ve geri
  doldurma mantığı gerektirirdi. 2026-08-16 onaylandı
- **Süpürme Upstash QStash ile 15 dakikada bir tetiklenir** — Vercel Cron ücretsiz planda
  günde yalnızca 1 tetikleme verdiği için elendi: "açılıştan 1-2 saat sonra" kuralı ve
  her işletmeyi kendi açılış saatinde yakalaması gereken günlük özet günde tek çağrıyla
  taşınamaz. Upstash hesabı projede zaten kurulu. 2026-08-16 onaylandı
- **Günlük özet (satır 38) sık cron + açılış penceresi + Redis NX kilidi ile zamanlanır** —
  her turda işletmenin YEREL saati o günkü açılışın ilk 30 dakikasına düşüyorsa özet
  gönderilir; `digest:<businessId>:<yerelGün>` anahtarı (SET NX, 26 saat TTL) aynı gün
  ikinci gönderimi engeller. **Redis'e ULAŞILAMAZSA kilit kontrolü atlanır ve özet yine de
  gönderilir** (fail-open, mevcut rate-limit politikasıyla tutarlı): bir altyapı kesintisinin
  bildirimi tamamen susturması, nadir bir çift bildirimden daha maliyetli görüldü.
  Migration gerektirmeyen çözüm tercih edildi. 2026-08-16 onaylandı
- **Cron endpoint'i `Authorization: Bearer <CRON_SECRET>` ile korunur** — `timingSafeEqual`
  ile sabit süreli karşılaştırma, en az 32 karakter kriptografik rastgele değer
  (`SESSION_SECRET` ile aynı kalıp). QStash imza doğrulaması yerine ortak sır seçildi:
  sağlayıcıdan bağımsız kalır ve elle test edilebilir. 2026-08-16 onaylandı
- Turnstile widget'ı İSTEMCİDE yüklenemezse (reklam engelleyici, CDN erişimi yok) gönderim
  KİLİTLİ kalır ve kullanıcıya görünür bir hata gösterilir. Sunucu tarafı fail-open
  politikası (yukarıdaki madde) burada GEÇERLİ DEĞİLDİR: "Cloudflare'e ulaşamadık" bizim
  altyapı sorunumuzdur ve atlanabilir, ancak "istemci hiç doğrulama yapmadı" bot korumasının
  tamamen devre dışı kalması demektir. Sessiz kilitlenme yasak. 2026-08-15 onaylandı
- **Olmayan slug 404, geçersiz `publicToken` 200-ama-indekslenmez** — iki "bulunamadı"
  durumu semantik olarak farklıdır ve farklı yanıt verir. Olmayan bir işletme slug'ı
  gerçekten yok olan bir adrestir: `notFound()` ile 404. Geçersiz/eski bir `publicToken`
  ise tahmin edilemez olduğu için "böyle bir sayfa yok" değil "böyle bir kayıt yok"
  anlamına gelir; randevu detay sayfası 200 döner, istemci tarafındaki
  "Randevu bulunamadı." mesajı gösterilir ve sayfa `generateMetadata` içinde
  `robots: { index: false }` ile arama motorlarına kapatılır. 2026-08-17 onaylandı
- **Onay linki `wa.me` yerine `api.whatsapp.com/send/` üretir** — spec satır 27 lafzen
  "`wa.me` linki" diyor, hedef adres değişti, davranış aynı kaldı (berber tıklar, kendi
  WhatsApp'ı hazır metinle açılır, MANUEL gönderir; satır 55 hâlâ geçerli, resmi API yok).
  Gerekçe ölçümdür, tercih değil: `wa.me` isteği 302 ile `api.whatsapp.com`'a yönlendirirken
  `text` parametresindeki BMP dışı karakterleri bozuyor —
  `?text=%F0%9F%93%85` gönderildiğinde `Location: ...&text=%EF%BF%BD` dönüyor, yani
  mesajdaki 📅 ✂️ 📍 berbere `�` olarak görünüyordu. Aynı adres doğrudan çağrıldığında
  yönlendirme hiç olmuyor (200) ve emoji bozulmadan iletiliyor. Türkçe karakterler her iki
  yolda da sağlamdı. 2026-08-17 onaylandı