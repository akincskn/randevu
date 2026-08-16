import type { Metadata } from "next";
import { ServicesView } from "@/components/dashboard/services-view";

export const metadata: Metadata = { title: "Hizmetler" };

/** Hizmet yönetimi — spec satır 17 (isim, süre, opsiyonel fiyat). */
export default function ServicesPage() {
  return <ServicesView />;
}
