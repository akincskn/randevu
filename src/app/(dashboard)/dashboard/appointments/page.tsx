import { Suspense } from "react";

import { AppointmentsView } from "@/components/dashboard/appointments-view";

/**
 * Tüm randevular — spec satır 24.
 *
 * `Suspense` şart: `AppointmentsView` başlangıç kapsamını `useSearchParams` ile
 * okuyor ve Next.js bu hook'u kullanan ağacın bir suspense sınırıyla sarılmasını
 * ister (aksi halde sayfa tamamen dinamiğe düşer).
 */
export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsView />
    </Suspense>
  );
}
