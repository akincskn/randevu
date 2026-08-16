import { BULUNAMADI_BASLIGI, NotFoundScreen } from "@/components/not-found-screen";

/**
 * EŞLEŞMEYEN URL'ler için 404 (global 404 rolü de bunda).
 *
 * `notFound()` ile gelen 404 da buraya düşer, ancak kök layout DIŞINDA render edilir —
 * ölçülmüş framework davranışı, `not-found-screen.tsx` başındaki nota bakın.
 */
export const metadata = {
  title: BULUNAMADI_BASLIGI,
};

export default function NotFound() {
  return <NotFoundScreen />;
}
