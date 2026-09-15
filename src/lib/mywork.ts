// «Мой пост» мастера — чистые правила над записями дня и привязками мастеров.
// Базы и сети здесь нет: экран читает записи сам, оболочка по тем же
// правилам находит текущую запись для вкладки «Осмотр», а тест проверяет
// ловушки (mywork.test.ts).
//
// ЧЬЯ ЗАПИСЬ. Привязка мастера к записи живёт на сайте отдельной таблицей
// (lib/api/masters.ts), а в самой записи есть только номер поста. Поэтому
// запись — моя, если она привязана ко мне, а без привязки — если стоит на
// моём посту: «по умолчанию — мастер поста», как в макете. Пока сайт не
// отдаёт привязок вовсе, второе правило и есть весь экран.
import type { StoBookingRow } from "@/lib/sto/types";
import type { BookingMaster } from "@/lib/api/masters";
import { isLive } from "@/lib/stats";

/** Живые записи дня, за которые отвечает мастер, в порядке времени. */
export function masterBookings(
  rows: readonly StoBookingRow[],
  links: readonly BookingMaster[],
  masterId: number,
  postNo: number | null,
): StoBookingRow[] {
  const linked = new Map(links.map(l => [l.bookingId, l.masterId]));
  return rows
    .filter(isLive)
    .filter(b => {
      const owner = linked.get(b.id);
      return owner === undefined ? postNo !== null && b.post_no === postNo : owner === masterId;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Запись, которая идёт прямо сейчас. Выполненная — уже не «в работе». */
export function jobNow(rows: readonly StoBookingRow[], now: Date): StoBookingRow | null {
  const t = now.getTime();
  return rows.find(b =>
    (b.status === "new" || b.status === "confirmed")
    && new Date(b.starts_at).getTime() <= t && t < new Date(b.ends_at).getTime()) ?? null;
}

/** Что ещё впереди: начнётся после «сейчас» и не закрыто. */
export function jobsAfter(rows: readonly StoBookingRow[], now: Date): StoBookingRow[] {
  const t = now.getTime();
  return rows
    .filter(b => b.status !== "done" && new Date(b.starts_at).getTime() > t)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * «осталось N мин» — до конца записи. Вверх, а не вниз: полминуты до конца
 * — это ещё «1 мин», а не «0 мин», и никогда не отрицательно — просроченная
 * запись показывает «0 мин», а не «−12».
 */
export function minutesLeft(endsAt: string | Date, now: Date): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 60_000));
}

/** Сколько минут занимают записи — плитка «Занято». */
export function busyMinutes(rows: readonly StoBookingRow[]): number {
  return rows.reduce((s, b) =>
    s + Math.max(0, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000)), 0);
}

/**
 * Запись, к которой ведёт «Осмотр» из оболочки: та, что идёт сейчас, иначе
 * ближайшая впереди. null — сегодня осматривать нечего.
 */
export function inspectTarget(rows: readonly StoBookingRow[], now: Date): StoBookingRow | null {
  return jobNow(rows, now) ?? jobsAfter(rows, now)[0] ?? null;
}
