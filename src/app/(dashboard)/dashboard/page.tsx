import { AppointmentList } from "@/components/dashboard/appointment-list";

/**
 * Panel ana sayfası — spec satır 24 (bekleyen randevular) + satır 39 (rozet).
 *
 * Rozet bu sayfada DEĞİL, layout'ta durur (`components/dashboard/shell.tsx`):
 * spec "her zaman görünür" dediği için tüm sekmelerde kalması gerekir.
 */
export default function DashboardPage() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Bugünün randevuları</h2>
      <AppointmentList
        kapsam="today"
        tarihGoster={false}
        bosMesaj="Bugün için randevu yok."
      />
    </section>
  );
}
