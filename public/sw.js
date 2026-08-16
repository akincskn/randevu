/*
 * Service worker — Web Push alıcısı (PROJECT_SPEC.md satır 36-38).
 *
 * Bu dosya TARAYICIDA çalışır, Next.js bundle'ının parçası değildir; bu yüzden
 * düz JavaScript'tir ve `public/` altında durur (kök scope'ta yayınlanmalı:
 * /sw.js dosyası yalnızca kökten servis edilirse tüm siteyi kapsayabilir).
 *
 * Sözleşme: sunucu `src/lib/push.ts`'ten şu JSON'u gönderir:
 *   { baslik: string, govde: string, url: string, etiket: string }
 */

/* global self, clients */

const VARSAYILAN_BASLIK = "Randevu";
const VARSAYILAN_YOL = "/dashboard/appointments?scope=pending";

/** Yükü savunmacı çözer: bozuk/boş payload bildirimi tamamen kaybetmemeli. */
function icerikCoz(event) {
  const varsayilan = {
    baslik: VARSAYILAN_BASLIK,
    govde: "Panelinizde yeni bir gelişme var.",
    url: VARSAYILAN_YOL,
    etiket: "randevu",
  };

  if (!event.data) return varsayilan;

  let ham;
  try {
    ham = event.data.json();
  } catch (hata) {
    console.error("[sw] push yükü JSON değil:", hata);
    return varsayilan;
  }

  if (typeof ham !== "object" || ham === null) return varsayilan;

  return {
    baslik: typeof ham.baslik === "string" && ham.baslik ? ham.baslik : varsayilan.baslik,
    govde: typeof ham.govde === "string" && ham.govde ? ham.govde : varsayilan.govde,
    url: typeof ham.url === "string" && ham.url.startsWith("/") ? ham.url : varsayilan.url,
    etiket: typeof ham.etiket === "string" && ham.etiket ? ham.etiket : varsayilan.etiket,
  };
}

self.addEventListener("push", (event) => {
  const icerik = icerikCoz(event);

  // waitUntil ŞART: olmadan tarayıcı worker'ı bildirimi göstermeden sonlandırabilir.
  event.waitUntil(
    self.registration.showNotification(icerik.baslik, {
      body: icerik.govde,
      // Aynı etiketli önceki bildirimi EZER — üst üste talepte yığılma olmaz.
      tag: icerik.etiket,
      // renotify: tag ezildiğinde bile berberi yeniden uyar; sessiz güncelleme
      // "gözden kaçmasın" (spec satır 24) amacına aykırı olurdu.
      renotify: true,
      data: { url: icerik.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const hedef =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : VARSAYILAN_YOL;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((pencereler) => {
      const ayniKaynak = pencereler.filter(
        (pencere) => new URL(pencere.url).origin === self.location.origin,
      );

      // Panel zaten açıksa YENİ SEKME AÇMA: var olanı öne getirip yönlendir.
      //
      // `navigate()` YALNIZCA bu worker'ın KONTROL ETTİĞİ istemcilerde çalışır;
      // kontrolsüz bir sekmede TypeError ile reddedilir. Bu sık görülen bir
      // durumdur: worker kaydedilmeden önce açılmış her sekme kontrolsüzdür ve
      // ilk yenilemeye kadar öyle kalır. Yakalanmazsa tıklama SESSİZCE hiçbir
      // şey yapmaz — bu yüzden başarısızlıkta yeni sekme açmaya düşülür.
      const yonlendir = (pencere) =>
        Promise.resolve(pencere.focus())
          .then((odaklanan) => {
            const hedefPencere = odaklanan || pencere;
            if (!hedefPencere.navigate) {
              throw new Error("navigate() desteklenmiyor");
            }
            return hedefPencere.navigate(hedef);
          })
          .catch((hata) => {
            console.error("[sw] mevcut sekme yönlendirilemedi, yeni sekme açılıyor:", hata);
            return clients.openWindow(hedef);
          });

      return ayniKaynak.length > 0 ? yonlendir(ayniKaynak[0]) : clients.openWindow(hedef);
    }),
  );
});
