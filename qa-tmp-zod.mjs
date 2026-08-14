import { z } from "zod";
console.log("z.url", typeof z.url, "| z.iso.datetime", typeof z.iso?.datetime, "| z.treeifyError", typeof z.treeifyError);
const s = z.iso.datetime({ offset: true, message: "x" });
for (const v of ["2026-08-20T10:00:00Z", "2026-08-20T10:00:00+03:00", "2026-08-20T10:00:00", "2026-08-20T10:00:00.123Z", "2026-08-20T10:00Z", "2026-08-20T10:00:00+03:30"]) {
  console.log(JSON.stringify(v), s.safeParse(v).success);
}
// treeifyError shape
const obj = z.object({ a: z.string() });
const r = obj.safeParse({ a: 1 });
console.log("treeify:", JSON.stringify(z.treeifyError(r.error)));
// telefon normalize
function telefonNormalizeEt(ham) {
  const rakamlar = ham.replace(/\D/g, "");
  if (rakamlar.length === 12 && rakamlar.startsWith("90")) return rakamlar.slice(2);
  if (rakamlar.length === 11 && rakamlar.startsWith("0")) return rakamlar.slice(1);
  return rakamlar;
}
const tel = z.string().transform(telefonNormalizeEt).refine((v) => /^5\d{9}$/.test(v));
for (const v of ["0532 111 22 33", "+90 532 111 22 33", "5321112233", "+900532 111 22 33", "0090 532 111 22 33", "90532 111 22 33", "532-111-22-33", "  05321112233  ", "+90(532)111 22 33"]) {
  const r2 = tel.safeParse(v);
  console.log(JSON.stringify(v), "->", r2.success ? r2.data : "REJECT(" + telefonNormalizeEt(v) + ")");
}
