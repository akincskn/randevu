import { DashboardShell } from "@/components/dashboard/shell";

/**
 * Panel layout'u — spec satır 39 gereği bekleyen randevu rozeti burada durur,
 * böylece dört sekmenin hepsinde görünür kalır.
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <DashboardShell>{children}</DashboardShell>;
}
