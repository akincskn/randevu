const f = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul", weekday: "short", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
console.log("resolved:", JSON.stringify(f.resolvedOptions()));
console.log(JSON.stringify(f.formatToParts(new Date("2026-08-20T07:00:00Z")), null, 1));
console.log("formatted:", f.format(new Date("2026-08-20T07:00:00Z")));
console.log("node", process.version);
