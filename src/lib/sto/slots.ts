// Свободные окна записи: расписание × посты × длительность × занятые записи.
//
// Одна чистая функция без базы — её же (тем же текстом) должен получить сайт
// для виджета записи (#1267), чтобы календарь сервиса и виджет показывали
// одни и те же окна. Пояс один на всю Абхазию — Europe/Moscow (UTC+3, без
// перевода часов), поэтому «09:00 в расписании» превращается в момент
// времени простым смещением, без библиотек зон.
import type { StoSchedule, StoDay } from "./schedule";
import { STO_DAYS, toMinutes } from "./schedule";

/** Пояс сервисов: Абхазия живёт по московскому времени, перевода часов нет. */
export const STO_TZ_OFFSET = "+03:00";
export const STO_TZ_OFFSET_MIN = 180;

/** Записываться можно не раньше чем через столько минут от «сейчас». */
export const DEFAULT_LEAD_MIN = 60;

export type BusyInterval = { postNo: number; startsAt: Date; endsAt: Date };
export type FreeSlot = { startsAt: Date; endsAt: Date; postNo: number };

/** Момент «day HH:MM» по часам сервиса. «24:00» — полночь следующего дня. */
export function localTime(day: string, hhmm: string): Date {
  const min = toMinutes(hhmm);
  const base = new Date(`${day}T00:00:00${STO_TZ_OFFSET}`);
  return new Date(base.getTime() + min * 60_000);
}

/** День недели даты YYYY-MM-DD по часам сервиса. */
export function dayOfWeek(day: string): StoDay {
  // getUTCDay у полуночи по +03:00 — это 21:00 предыдущего дня UTC, поэтому
  // берём полдень: он в тот же день и в UTC, и по +03:00.
  const noon = new Date(`${day}T12:00:00${STO_TZ_OFFSET}`);
  const js = noon.getUTCDay(); // 0 = вс
  return STO_DAYS[(js + 6) % 7];
}

/** Дата YYYY-MM-DD, на которую приходится момент по часам сервиса. */
export function localDay(at: Date): string {
  return new Date(at.getTime() + STO_TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** «ЧЧ:ММ» момента по часам сервиса. */
export function localHHMM(at: Date): string {
  return new Date(at.getTime() + STO_TZ_OFFSET_MIN * 60_000).toISOString().slice(11, 16);
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

/**
 * Окна дня, на которые хватает свободного поста на всю длительность.
 * Пост — первый свободный (сервис может переставить при подтверждении).
 * Окно должно целиком лежать внутри интервала работы: услуга «через обед»
 * не предлагается. Прошедшее и ближайшее (leadMin) время не предлагается.
 */
export function freeSlots(input: {
  schedule: StoSchedule;
  day: string;
  durationMin: number;
  busy: readonly BusyInterval[];
  now: Date;
  leadMin?: number;
}): FreeSlot[] {
  const { schedule, day, durationMin, busy, now } = input;
  const leadMin = input.leadMin ?? DEFAULT_LEAD_MIN;
  if (!Number.isInteger(durationMin) || durationMin <= 0) return [];
  if (schedule.daysOff.includes(day)) return [];
  const intervals = schedule.days[dayOfWeek(day)] ?? [];
  const earliest = new Date(now.getTime() + leadMin * 60_000);
  const out: FreeSlot[] = [];
  for (const it of intervals) {
    const from = toMinutes(it.from);
    const to = toMinutes(it.to);
    for (let t = from; t + durationMin <= to; t += schedule.stepMin) {
      const startsAt = localTime(day, `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
      if (startsAt < earliest) continue;
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const postNo = firstFreePost(schedule.posts, busy, startsAt, endsAt);
      if (postNo !== null) out.push({ startsAt, endsAt, postNo });
    }
  }
  return out;
}

/** Первый пост без пересечений с занятыми интервалами; null — все заняты. */
export function firstFreePost(posts: number, busy: readonly BusyInterval[], startsAt: Date, endsAt: Date): number | null {
  for (let p = 1; p <= posts; p++) {
    const taken = busy.some(b => b.postNo === p && overlaps(startsAt, endsAt, b.startsAt, b.endsAt));
    if (!taken) return p;
  }
  return null;
}

/** Окно ещё свободно? Для повторной проверки перед записью и для переноса. */
export function isSlotFree(input: {
  schedule: StoSchedule;
  startsAt: Date;
  durationMin: number;
  busy: readonly BusyInterval[];
  postNo?: number;
}): { ok: true; postNo: number } | { ok: false; reason: "closed" | "taken" } {
  const { schedule, startsAt, durationMin, busy } = input;
  const day = localDay(startsAt);
  if (schedule.daysOff.includes(day)) return { ok: false, reason: "closed" };
  const startMin = toMinutes(localHHMM(startsAt));
  const inside = (schedule.days[dayOfWeek(day)] ?? []).some(it => startMin >= toMinutes(it.from) && startMin + durationMin <= toMinutes(it.to));
  if (!inside) return { ok: false, reason: "closed" };
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  if (input.postNo != null) {
    const taken = busy.some(b => b.postNo === input.postNo && overlaps(startsAt, endsAt, b.startsAt, b.endsAt));
    return taken ? { ok: false, reason: "taken" } : { ok: true, postNo: input.postNo };
  }
  const postNo = firstFreePost(schedule.posts, busy, startsAt, endsAt);
  return postNo === null ? { ok: false, reason: "taken" } : { ok: true, postNo };
}
