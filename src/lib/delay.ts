// «Мастер задерживается»: план продления записи и сдвига идущих следом —
// чистая арифметика над записями, без базы (проверяется delay.test.ts).
// Пишет строки delayBooking (lib/bookings.ts).
import type { StoBookingRow } from "@/lib/sto/types";
import { canReschedule } from "@/lib/sto/transitions";

/** Чипы «Нужно больше времени»: шторка рисует, delayAction проверяет.
 *  Не в actions.ts: "use server"-файл экспортирует только async-функции. */
export const DELAY_CHOICES = [15, 30, 45, 60];

export type DelayShift = {
  row: StoBookingRow;
  newStart: Date;
  newEnd: Date;
  /** На сколько минут уехала эта запись — это число видит её клиент. */
  shiftMin: number;
};

export type DelayPlan =
  | { ok: true; booking: StoBookingRow; endsAt: Date; shifts: DelayShift[] }
  | { ok: false; error: string };

/**
 * Продлить запись на minutes и посчитать, кого это толкает. Сдвигаются
 * только живые записи ТОГО ЖЕ поста, цепочкой: каждая встаёт сразу за
 * предыдущей, длительность своя. Зазор между записями поглощает задержку —
 * на первом достаточном зазоре цепочка кончается, дальше никто не едет.
 * Буфер расписания при этом съедается сознательно: задержка и есть съеденный
 * запас, двигать клиентов ещё дальше ради буфера — хуже.
 */
export function planDelay(input: { rows: readonly StoBookingRow[]; bookingId: number; minutes: number }): DelayPlan {
  const { rows, bookingId, minutes } = input;
  const booking = rows.find(r => r.id === bookingId);
  if (!booking) return { ok: false, error: "Запись не найдена" };
  if (!canReschedule(booking.status)) return { ok: false, error: "Продлить можно только живую запись" };

  const endsAt = new Date(new Date(booking.ends_at).getTime() + minutes * 60_000);
  // Сравниваем моменты, а не строки: формат ISO из базы одинаковый, но
  // полагаться на это молча не стоит.
  const after = new Date(booking.starts_at).getTime();
  const tail = rows
    .filter(r => r.id !== booking.id && r.post_no === booking.post_no && canReschedule(r.status)
      && new Date(r.starts_at).getTime() >= after)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const shifts: DelayShift[] = [];
  let prevEnd = endsAt;
  for (const row of tail) {
    const start = new Date(row.starts_at);
    if (start.getTime() >= prevEnd.getTime()) break;
    const durationMs = new Date(row.ends_at).getTime() - start.getTime();
    const newStart = prevEnd;
    const newEnd = new Date(newStart.getTime() + durationMs);
    shifts.push({ row, newStart, newEnd, shiftMin: Math.round((newStart.getTime() - start.getTime()) / 60_000) });
    prevEnd = newEnd;
  }
  return { ok: true, booking, endsAt, shifts };
}
