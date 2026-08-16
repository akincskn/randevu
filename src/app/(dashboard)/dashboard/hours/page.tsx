import type { Metadata } from "next";
import { HoursView } from "@/components/dashboard/hours-view";

export const metadata: Metadata = { title: "Çalışma saatleri" };

/** Çalışma saatleri — spec satır 18 (haftalık tekrar eden) + satır 19 (istisnalar). */
export default function HoursPage() {
  return <HoursView />;
}
