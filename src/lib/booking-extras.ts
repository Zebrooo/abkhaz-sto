// Доп. услуги записи (data.extras) и задержка мастера (data.delays) — чистые
// правила для экранов и денег, без базы; проверяются booking-extras.test.ts.
import type { StoBookingRow } from "@/lib/sto/types";

type Priced = Pick<StoBookingRow, "service" | "data">;

/** Сумма доп. услуг; без цены — ноль, работа «договорная». */
export function extrasTotal(b: Priced): number {
  return (b.data.extras ?? []).reduce((s, e) => s + (e.price ?? 0), 0);
}

/** Деньги записи целиком: услуга + добавленное по ходу работы. */
export function bookingRevenue(b: Priced): number {
  return (b.service.price ?? 0) + extrasTotal(b);
}

/**
 * Цена для показа у записи. null — «договорная»: когда ни у услуги, ни у
 * добавленного цены нет; иначе сумма всех известных цен.
 */
export function bookingPrice(b: Priced): number | null {
  const extras = b.data.extras ?? [];
  if (b.service.price === null && !extras.some(e => e.price !== null)) return null;
  return bookingRevenue(b);
}

/** На сколько минут запись продлевали «задерживаюсь» — 0, если не задерживались. */
export function delayedMin(b: Pick<StoBookingRow, "data">): number {
  return (b.data.delays ?? []).reduce((s, d) => s + d.minutes, 0);
}
