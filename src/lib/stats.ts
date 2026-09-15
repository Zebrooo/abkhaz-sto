// Сводка смены и разметка таймлайна — чистые функции над записями и
// расписанием. Здесь нет базы: экраны читают записи сами, а эти правила
// проверяются тестами (stats.test.ts).
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { minutesLabel } from "@/lib/format";
import { toMinutes } from "@/lib/sto/schedule";
import { dayOfWeek } from "@/lib/sto/slots";

/** Запись, которая занимает окно и считается в деньгах: живая или выполненная. */
export function isLive(b: StoBookingRow): boolean {
  return b.status === "new" || b.status === "confirmed" || b.status === "done";
}

export type DayWindow = { fromMin: number; toMin: number; workMin: number; off: boolean };

/**
 * Рабочее окно дня: от начала первого интервала до конца последнего —
 * по нему рисуется сетка часов. workMin — только время приёма, без обеда.
 * Выходной или пустое расписание — окно 09:00–18:00, чтобы экран не схлопнулся.
 */
export function dayWindow(schedule: StoSchedule | null, day: string): DayWindow {
  const intervals = schedule && !schedule.daysOff.includes(day) ? (schedule.days[dayOfWeek(day)] ?? []) : [];
  if (intervals.length === 0) return { fromMin: 9 * 60, toMin: 18 * 60, workMin: 0, off: true };
  const fromMin = Math.min(...intervals.map(i => toMinutes(i.from)));
  const toMin = Math.max(...intervals.map(i => toMinutes(i.to)));
  const workMin = intervals.reduce((s, i) => s + (toMinutes(i.to) - toMinutes(i.from)), 0);
  return { fromMin, toMin, workMin, off: false };
}

export type DayStats = {
  /** Живые и выполненные записи дня. */
  count: number;
  /** Деньги дня: всё, кроме отменённых и неявок. */
  revenue: number;
  /** Средний чек, ₽. */
  average: number;
  /** Занятых окон и всего окон по постам. */
  busySlots: number;
  totalSlots: number;
  /** Загрузка, 0…100. */
  loadPct: number;
  posts: number;
  /** Ждут подтверждения. */
  pending: number;
};

/** Сводка дня: то, что видно на «Смене» и в правой колонке рабочего места. */
export function dayStats(input: { rows: readonly StoBookingRow[]; schedule: StoSchedule | null; day: string; posts: number }): DayStats {
  const { rows, schedule, day } = input;
  const posts = Math.max(1, input.posts);
  const live = rows.filter(isLive);
  const revenue = live.reduce((s, b) => s + (b.service.price ?? 0), 0);
  const win = dayWindow(schedule, day);
  const step = schedule?.stepMin ?? 30;
  const totalSlots = Math.floor(win.workMin / step) * posts;
  // Буфер между записями (schedule.bufferMin) сюда не входит: загрузка — доля
  // смены, которую мастер работает, а буфер — не работа и не деньги. С «занято
  // N окон из M» это не расходится: окна здесь считаются по ends_at, как
  // записи лежат в базе; буфер живёт только в расчёте свободных окон
  // (slots.ts), и день с буфером просто не доберёт 100% — между машинами
  // мастер не работает, и так и должно быть видно.
  const busySlots = live.reduce((s, b) => {
    const min = Math.max(0, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000));
    return s + Math.ceil(min / step);
  }, 0);
  return {
    count: live.length,
    revenue,
    average: live.length > 0 ? Math.round(revenue / live.length) : 0,
    busySlots,
    totalSlots,
    loadPct: totalSlots > 0 ? Math.min(100, Math.round((busySlots / totalSlots) * 100)) : 0,
    posts,
    pending: rows.filter(b => b.status === "new").length,
  };
}

/** Окно короче 45 минут на сетке не показываем: записать в него нечего. */
export const MIN_FREE_MIN = 45;

export type FreeGap = { fromMin: number; toMin: number };

/**
 * Свободные куски поста внутри часов приёма. Считаем по интервалам дня, а не
 * от первого до последнего часа: обед — не свободное окно, предлагать запись
 * в него нельзя.
 */
export function freeGaps(
  intervals: readonly { from: string; to: string }[],
  busy: readonly { from: number; to: number }[],
): FreeGap[] {
  const out: FreeGap[] = [];
  for (const iv of intervals) {
    let cursor = toMinutes(iv.from);
    const end = toMinutes(iv.to);
    const inside = busy.filter(b => b.to > cursor && b.from < end).sort((a, b) => a.from - b.from);
    for (const b of inside) {
      if (b.from - cursor >= MIN_FREE_MIN) out.push({ fromMin: cursor, toMin: b.from });
      cursor = Math.max(cursor, b.to);
    }
    if (end - cursor >= MIN_FREE_MIN) out.push({ fromMin: cursor, toMin: end });
  }
  return out;
}

export type PostNow = {
  no: number;
  busy: boolean;
  /** Что на посту сейчас или сколько свободно. */
  line: string;
  /** «до 12:30» или время, когда пост освободится. */
  till: string;
  bookingId: number | null;
};

/** Что на постах в момент now: занятая запись или длина свободного окна. */
export function postsNow(input: {
  rows: readonly StoBookingRow[];
  posts: number;
  now: Date;
  dayEnd: Date;
  hhmm: (at: Date) => string;
}): PostNow[] {
  const { rows, now, dayEnd, hhmm } = input;
  const live = rows.filter(b => b.status === "new" || b.status === "confirmed" || b.status === "done");
  return Array.from({ length: Math.max(1, input.posts) }, (_, i) => i + 1).map(no => {
    const onPost = live.filter(b => b.post_no === no).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const current = onPost.find(b => new Date(b.starts_at) <= now && now < new Date(b.ends_at));
    if (current) {
      const car = current.data.vehicle?.brand ?? current.data.client?.name ?? "клиент";
      return { no, busy: true, line: `${car} · ${current.service.title.toLowerCase()}`, till: `до ${hhmm(new Date(current.ends_at))}`, bookingId: current.id };
    }
    const next = onPost.find(b => new Date(b.starts_at) > now);
    const freeUntil = next ? new Date(next.starts_at) : dayEnd;
    const freeMin = Math.max(0, Math.round((freeUntil.getTime() - now.getTime()) / 60_000));
    return {
      no,
      busy: false,
      line: freeMin > 0 ? `окно ${minutesLabel(freeMin)} до ${hhmm(freeUntil)}` : "смена закончилась",
      till: hhmm(now),
      bookingId: null,
    };
  });
}
