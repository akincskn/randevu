const HAFTA_GUNU_INDEKS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function yerelAnHesapla(an, timezone) {
  const parcalar = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(an);
  const al = (t) => parcalar.find((p) => p.type === t)?.value ?? "";
  const saat = Number(al("hour")) % 24;
  const dakika = Number(al("minute"));
  const haftaninGunu = HAFTA_GUNU_INDEKS[al("weekday")];
  if (haftaninGunu === undefined || Number.isNaN(saat) || Number.isNaN(dakika)) throw new Error("tz: " + timezone);
  return { isoGun: `${al("year")}-${al("month")}-${al("day")}`, haftaninGunu, dakika: saat * 60 + dakika };
}
function gunlukAralikCoz(yerel, haftalik, istisna) {
  if (istisna) {
    if (istisna.isClosed) return null;
    if (istisna.opensAtMinute === null || istisna.closesAtMinute === null) return null;
    return { acilis: istisna.opensAtMinute, kapanis: istisna.closesAtMinute };
  }
  if (!haftalik || !haftalik.isOpen) return null;
  if (haftalik.opensAtMinute === null || haftalik.closesAtMinute === null) return null;
  return { acilis: haftalik.opensAtMinute, kapanis: haftalik.closesAtMinute };
}
function kontrol(baslangic, bitis, timezone, haftalik, istisna) {
  const yb = yerelAnHesapla(baslangic, timezone);
  const ye = yerelAnHesapla(bitis, timezone);
  if (yb.isoGun !== ye.isoGun) return { uygun: false, sebep: "Randevu gece yarısını geçemez." };
  const aralik = gunlukAralikCoz(yb, haftalik, istisna);
  if (!aralik) return { uygun: false, sebep: "İşletme bu gün kapalı." };
  if (yb.dakika < aralik.acilis || ye.dakika > aralik.kapanis) return { uygun: false, sebep: "Çalışma saatleri dışında." };
  return { uygun: true };
}

console.log("=== yerelAnHesapla ===");
for (const [iso, tz] of [
  ["2026-08-20T07:00:00Z", "Europe/Istanbul"],
  ["2026-08-19T21:00:00Z", "Europe/Istanbul"],
  ["2026-08-19T20:59:00Z", "Europe/Istanbul"],
  ["2026-03-29T00:30:00Z", "Europe/Berlin"],
  ["2026-03-29T01:30:00Z", "Europe/Berlin"],
  ["2026-10-25T00:30:00Z", "Europe/Berlin"],
  ["2026-08-20T04:00:00Z", "America/New_York"],
  ["2026-08-20T07:00:00Z", "Asia/Kathmandu"],
]) console.log(iso, tz, JSON.stringify(yerelAnHesapla(new Date(iso), tz)));

console.log("\n=== calisma saati kontrolu (TR, 09:00-18:00 => 540..1080) ===");
const wh = { isOpen: true, opensAtMinute: 540, closesAtMinute: 1080 };
const t = (s, dk) => { const b = new Date(s); const e = new Date(b.getTime() + dk * 60000); return [s + " +" + dk + "dk", JSON.stringify(kontrol(b, e, "Europe/Istanbul", wh, null))]; };
console.log(...t("2026-08-20T06:00:00Z", 30));  // 09:00 local, tam acilis
console.log(...t("2026-08-20T14:30:00Z", 30));  // 17:30 -> 18:00 tam kapanis
console.log(...t("2026-08-20T15:00:00Z", 30));  // 18:00 -> 18:30 disari
console.log(...t("2026-08-20T05:59:00Z", 30));  // 08:59
// gece yarisinda biten randevu, 24 saat acik isletme (0..1440)
const wh24 = { isOpen: true, opensAtMinute: 0, closesAtMinute: 1440 };
const b = new Date("2026-08-20T20:30:00Z"); // 23:30 local
const e = new Date(b.getTime() + 30 * 60000); // 00:00 ertesi gun
console.log("23:30->00:00 (24h isletme):", JSON.stringify(kontrol(b, e, "Europe/Istanbul", wh24, null)));

console.log("\n=== DST: Berlin 2026-03-29 saat 02:00->03:00 atlar, isletme 01:00-04:00 (60..240) ===");
const whB = { isOpen: true, opensAtMinute: 60, closesAtMinute: 240 };
const b2 = new Date("2026-03-29T00:30:00Z"); // 01:30 CET
const e2 = new Date(b2.getTime() + 60 * 60000); // +1h gercek = 03:30 CEST
console.log("01:30 CET +60dk:", JSON.stringify(kontrol(b2, e2, "Europe/Berlin", whB, null)),
  "| yerel bitis:", JSON.stringify(yerelAnHesapla(e2, "Europe/Berlin")));

console.log("\n=== istisna: isClosed=false ama saatler null ===");
console.log(JSON.stringify(kontrol(new Date("2026-08-20T06:00:00Z"), new Date("2026-08-20T06:30:00Z"), "Europe/Istanbul", wh, { isClosed: false, opensAtMinute: null, closesAtMinute: null })));
