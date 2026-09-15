// Свободные окна записи: расписание × посты × длительность × занятые записи (#1267).
//
// Буфер между записями (schedule.bufferMin) живёт только здесь: запись
// [starts, ends) держит пост до ends + bufferMin, и следующее окно на этом
// посту ставится не раньше. В базе запись остаётся без буфера — ends_at
// это конец работы, от него считаются деньги и «до 12:30» на постах.
//
// Одна чистая функция без базы. Это КОПИЯ файла сайта (djonua/abkhaz-auto,
// src/lib/sto/slots.ts): виджет записи на сайте и календарь сервиса обязаны
// показывать одни и те же окна, поэтому правки делаются на сайте и
// переносятся сюда тем же текстом (кроме этой шапки).
//
// Пояс один на всю Абхазию — Europe/Moscow (UTC+3, без перевода часов),
// поэтому «09:00 в расписании» превращается в момент времени простым
// смещением, без библиотек зон.
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

/**
 * Пост занят под окно [startsAt, endsAt)? Одно правило для freeSlots и
 * isSlotFree — сайт и приложение обязаны сходиться. Буфер стоит ПОСЛЕ записи,
 * не до: мастер закрывает работу и готовит пост к следующей машине, а перед
 * первой машиной смены и перед обедом готовить нечего — поэтому первое окно
 * дня остаётся в 09:00, а последнее упирается в конец смены без буфера.
 * Буфер получает и новое окно, и уже стоящие записи: иначе запись, поставленная
 * впритык ПЕРЕД чужой, вышла бы без буфера — а между двумя записями на посту
 * он нужен с любой стороны. Стык «до 10:15» / «с 10:15» — не пересечение.
 */
function postTaken(busy: readonly BusyInterval[], postNo: number, startsAt: Date, endsAt: Date, bufferMin: number): boolean {
  const pad = (Number.isFinite(bufferMin) && bufferMin > 0 ? bufferMin : 0) * 60_000;
  const held = endsAt.getTime() + pad;
  return busy.some(b => b.postNo === postNo && startsAt.getTime() < b.endsAt.getTime() + pad && b.startsAt.getTime() < held);
}

/**
 * Окна дня, на которые хватает свободного поста на всю длительность.
 * Пост — первый свободный (сервис может переставить при подтверждении).
 * Окно должно целиком лежать внутри интервала работы: услуга «через обед»
 * не предлагается. Прошедшее и ближайшее (leadMin) время не предлагается.
 * Занятость — с буфером сервиса после каждой записи (postTaken): окно на
 * 60 минут при буфере 15 держит пост 75, но само окно [startsAt, endsAt)
 * возвращается без буфера — таким оно и ляжет в базу.
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
  // Расписание из базы проходит normalizeStoSchedule (шаг из STO_STEPS_MIN,
  // посты 1…20), но цикл по сетке с шагом 0 — вечный, и вешает он весь
  // процесс, а не одну вкладку; одна строка страхует и копию в приложении.
  if (!Number.isInteger(schedule.stepMin) || schedule.stepMin <= 0) return [];
  if (!Number.isInteger(schedule.posts) || schedule.posts <= 0) return [];
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
      const postNo = firstFreePost(schedule.posts, busy, startsAt, endsAt, schedule.bufferMin);
      if (postNo !== null) out.push({ startsAt, endsAt, postNo });
    }
  }
  // По времени и без повторов: нормализованные интервалы дня не пересекаются,
  // но функция чистая и расписание может прийти откуда угодно.
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out.filter((s, i) => i === 0 || s.startsAt.getTime() !== out[i - 1].startsAt.getTime());
}

/** Первый пост без пересечений с занятыми интервалами (с буфером после записей); null — все заняты. */
export function firstFreePost(posts: number, busy: readonly BusyInterval[], startsAt: Date, endsAt: Date, bufferMin = 0): number | null {
  for (let p = 1; p <= posts; p++) {
    if (!postTaken(busy, p, startsAt, endsAt, bufferMin)) return p;
  }
  return null;
}

export type SlotCheck =
  | { ok: true; postNo: number }
  /** closed — вне часов работы или выходной; past — раньше «сейчас» + leadMin; no_post — такого поста у сервиса нет; taken — занято. */
  | { ok: false; reason: "closed" | "past" | "no_post" | "taken" };

/**
 * Окно ещё свободно? Последний рубеж перед записью и переносом, поэтому
 * проверяет всё то же, что freeSlots: часы работы и выходные, прошедшее и
 * ближайшее время (если передан now), существование поста, пересечения —
 * с тем же буфером между записями (postTaken).
 */
export function isSlotFree(input: {
  schedule: StoSchedule;
  startsAt: Date;
  durationMin: number;
  busy: readonly BusyInterval[];
  postNo?: number;
  /** «Сейчас» — без него прошедшее время не отсекается (перенос задним числом из приложения). */
  now?: Date;
  leadMin?: number;
}): SlotCheck {
  const { schedule, startsAt, durationMin, busy } = input;
  if (!Number.isInteger(durationMin) || durationMin <= 0) return { ok: false, reason: "closed" };
  if (input.now && startsAt < new Date(input.now.getTime() + (input.leadMin ?? DEFAULT_LEAD_MIN) * 60_000)) {
    return { ok: false, reason: "past" };
  }
  if (!Number.isInteger(schedule.posts) || schedule.posts <= 0) return { ok: false, reason: "no_post" };
  const day = localDay(startsAt);
  if (schedule.daysOff.includes(day)) return { ok: false, reason: "closed" };
  const startMin = toMinutes(localHHMM(startsAt));
  const inside = (schedule.days[dayOfWeek(day)] ?? []).some(it => startMin >= toMinutes(it.from) && startMin + durationMin <= toMinutes(it.to));
  if (!inside) return { ok: false, reason: "closed" };
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  if (input.postNo != null) {
    if (!Number.isInteger(input.postNo) || input.postNo < 1 || input.postNo > schedule.posts) return { ok: false, reason: "no_post" };
    const taken = postTaken(busy, input.postNo, startsAt, endsAt, schedule.bufferMin);
    return taken ? { ok: false, reason: "taken" } : { ok: true, postNo: input.postNo };
  }
  const postNo = firstFreePost(schedule.posts, busy, startsAt, endsAt, schedule.bufferMin);
  return postNo === null ? { ok: false, reason: "taken" } : { ok: true, postNo };
}
