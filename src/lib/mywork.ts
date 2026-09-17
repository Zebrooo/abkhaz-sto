// «Мой пост» мастера — чистые правила над записями дня и привязками мастеров.
// Базы и сети здесь нет: экран читает записи сам, оболочка по тем же
// правилам находит текущую запись для вкладки «Осмотр», а тест проверяет
// ловушки (mywork.test.ts).
//
// ЧЬЯ ЗАПИСЬ. Три источника, в таком порядке:
//  1) я сам принял эту машину (отметка на устройстве, post-hold.ts) — она
//     моя до конца работы, даже если её перенесут на другой пост;
//  2) привязка мастера к записи с сайта (lib/api/masters.ts) — админ назначил
//     исполнителя явно;
//  3) пост: «по умолчанию — мастер поста», как в макете. Пост берётся не
//     из справочника, а из сегодняшних отметок со временем — иначе переход
//     на другой подъёмник в обед задним числом переписал бы утро.
// Пока сайт не отдаёт привязок вовсе, работают первое и третье правила.
import type { StoBookingRow } from "@/lib/sto/types";
import type { BookingMaster } from "@/lib/api/masters";
import { isLive } from "@/lib/stats";
import { localHHMM } from "@/lib/sto/slots";
import { postAt, type PostMark } from "@/lib/post-hold";

/**
 * Живые записи дня, за которые отвечает мастер, в порядке времени.
 *
 * `post` — номер (мастер закреплён за постом в справочнике) или сегодняшние
 * отметки со временем: тогда «чей пост» решается на момент начала каждой
 * записи. `accepted` — записи, которые этот человек принял сам.
 *
 * masterId может быть null: учётка без строки мастера (сегодня это все —
 * сайт не отдаёт справочника) всё равно должна видеть записи своего поста,
 * иначе отметка на подъёмнике ничего не даёт. Чужую назначенную запись она
 * при этом не получает.
 */
export function masterBookings(
  rows: readonly StoBookingRow[],
  links: readonly BookingMaster[],
  masterId: number | null,
  post: number | null | readonly PostMark[],
  accepted: readonly number[] = [],
): StoBookingRow[] {
  const linked = new Map(links.map(l => [l.bookingId, l.masterId]));
  const mine = new Set(accepted);
  return rows
    .filter(isLive)
    .filter(b => {
      // Принятая машина остаётся за принявшим: её могут перенести на другой
      // пост, а работает с ней по-прежнему он.
      if (mine.has(b.id)) return true;
      const owner = linked.get(b.id);
      if (owner !== undefined) return masterId !== null && owner === masterId;
      if (post === null) return false;
      if (typeof post === "number") return b.post_no === post;
      return postAt(post, localHHMM(new Date(b.starts_at))) === b.post_no;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Сколько подъёмников предлагать мастеру. Расписание — главный источник, но
 * его может не быть вовсе (кривой jsonb молча читается как «не задано»), а
 * записи дня стоят на реальных постах: сервис с четырьмя подъёмниками не
 * должен схлопнуться в один.
 */
export function postCount(schedulePosts: number | undefined | null, rows: readonly StoBookingRow[]): number {
  return Math.max(1, schedulePosts ?? 0, ...rows.map(r => r.post_no));
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
 * Машина, которая по времени стоит на посту прямо сейчас, — включая уже
 * выполненную. Мастер нажал «Готово», а машина ещё на подъёмнике: осмотр и
 * отчёт по ней он открывает в эти же минуты, и уводить его на следующую
 * запись нельзя.
 */
export function jobHere(rows: readonly StoBookingRow[], now: Date): StoBookingRow | null {
  const t = now.getTime();
  return rows.find(b => new Date(b.starts_at).getTime() <= t && t < new Date(b.ends_at).getTime()) ?? null;
}

/** За сколько минут до начала записи машину считаем подошедшей по времени. */
export const DUE_LEAD_MIN = 15;

/**
 * Машины, которые пора принимать: время подошло (или уже идёт), работа не
 * закрыта. Именно их «Мой пост» показывает карточкой «принять».
 */
export function jobsDue(rows: readonly StoBookingRow[], now: Date, leadMin = DUE_LEAD_MIN): StoBookingRow[] {
  const t = now.getTime();
  return rows
    .filter(b => b.status !== "done"
      && new Date(b.starts_at).getTime() - leadMin * 60_000 <= t
      && t < new Date(b.ends_at).getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Запись, к которой ведёт «Осмотр» из оболочки: та, что стоит на посту
 * сейчас (даже закрытая), иначе ближайшая впереди. null — сегодня
 * осматривать нечего.
 */
export function inspectTarget(rows: readonly StoBookingRow[], now: Date): StoBookingRow | null {
  return jobHere(rows, now) ?? jobsAfter(rows, now)[0] ?? null;
}
