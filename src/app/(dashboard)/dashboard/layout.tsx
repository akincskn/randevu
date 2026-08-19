import { DashboardShell } from "@/components/dashboard/shell";

/**
 * Panel layout'u — spec satır 58 gereği bekleyen randevu rozeti burada durur,
 * böylece dört sekmenin hepsinde görünür kalır.
 *
 * VAPID PUBLIC anahtarı burada okunur (sunucu bileşeni) ve kabuğa prop olarak
 * geçer. Public anahtar zaten tarayıcıya gitmek ZORUNDA (`applicationServerKey`);
 * gizli olan `VAPID_PRIVATE_KEY` sunucuda kalır ve buraya hiç girmez.
 * `serverEnv()` KULLANILMAZ: o, eksik değişkende fırlatır ve anahtarsız bir
 * ortamda panelin tamamını çökertirdi — burada eksiklik yalnızca push
 * arayüzünün gizlenmesi anlamına gelir.
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";

  return <DashboardShell vapidPublicKey={vapidPublicKey}>{children}</DashboardShell>;
}
