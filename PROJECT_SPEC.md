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