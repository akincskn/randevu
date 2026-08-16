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
      // Panel zaten açıksa YENİ SEKME AÇMA: var olanı öne getirip yönlendir.
      for (const pencere of pencereler) {
        if (new URL(pencere.url).origin === self.location.origin) {
          return pencere.focus().then((odaklanan) => {
            const hedefPencere = odaklanan || pencere;
            return hedefPencere.navigate ? hedefPencere.navigate(hedef) : undefined;
          });
        }
      }
      return clients.openWindow(hedef);
    }),
  );
});
