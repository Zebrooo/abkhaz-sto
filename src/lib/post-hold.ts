// «Я занял подъёмник» — отметка мастера о том, где он стоит СЕГОДНЯ.
//
// Почему это не поле справочника. В справочнике мастеров есть postNo, но это
// закрепление: «Леван вообще-то на втором». Живой день другой — утром человек
// на втором, после обеда перешёл на третий, а завтра подменяет на первом.
// Если переписывать закрепление, утренние записи задним числом уедут к тому,
// кто их не делал. Поэтому отметка — СПИСОК с временем: «09:05 — пост 2»,
// «14:30 — пост 3», и чей пост, решается на момент начала каждой записи.
//
// Почему список принятых машин здесь же. На одном посту за день могут
// смениться двое, запись админ может перенести на другой пост — но машину
// принял конкретный человек, и она должна остаться его до конца работы.
// Приняли — запомнили номер записи, и дальше пост уже ничего не решает.
//
// Модуль чистый: ни куки, ни сети, ни базы — только разбор, сборка и правило
// «какой пост был в такое-то время» (post-hold.test.ts). Где это хранится,
// знает post-cookie.ts.
import { toMinutes } from "@/lib/sto/schedule";

/** Отметка: во сколько (ЧЧ:ММ по часам сервиса) человек встал на пост. */
export type PostMark = { postNo: number; at: string };

export type PostHold = {
  shopId: number;
  /** Учётка: чужую отметку с этого устройства не читаем. */
  userId: string;
  /** День сервиса (YYYY-MM-DD): вчерашняя отметка сегодня не действует. */
  day: string;
  marks: PostMark[];
  /** Записи, которые этот человек принял сам. */
  accepted: number[];
};

/** Переходов между постами за день больше не бывает — дальше это не работа, а мусор в куке. */
export const MAX_MARKS = 12;
/** Принятых машин за смену — с запасом на любой мыслимый день. */
export const MAX_ACCEPTED = 40;
/**
 * Насколько отметка задним числом забирает запись, начавшуюся ДО неё.
 * Мастер встал к машине в 09:05, а запись была на 09:00 — она его. Отметка
 * в 14:30 утренние записи не забирает, иначе сменщик присвоил бы чужое утро.
 */
export const BACKFILL_MIN = 60;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isPost = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 99;

export function emptyHold(who: { shopId: number; userId: string; day: string }): PostHold {
  return { shopId: who.shopId, userId: who.userId, day: who.day, marks: [], accepted: [] };
}

/**
 * Отметка из хранилища. Чужой сервис, чужая учётка, другой день и любой
 * мусор — null, а не исключение: кука приходит из браузера, ей нельзя верить,
 * а экран из-за неё падать не должен.
 */
export function parsePostHold(raw: string | null | undefined, who: { shopId: number; userId: string; day: string }): PostHold | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const h = data as Partial<PostHold>;
  if (h.shopId !== who.shopId || h.userId !== who.userId || h.day !== who.day) return null;
  if (typeof h.day !== "string" || !DAY.test(h.day)) return null;
  const marks = (Array.isArray(h.marks) ? h.marks : [])
    .filter((m): m is PostMark => !!m && typeof m === "object" && isPost((m as PostMark).postNo) && typeof (m as PostMark).at === "string" && HHMM.test((m as PostMark).at))
    .slice(0, MAX_MARKS)
    .sort((a, b) => a.at.localeCompare(b.at));
  const accepted = (Array.isArray(h.accepted) ? h.accepted : [])
    .filter((id): id is number => Number.isInteger(id) && (id as number) > 0)
    .slice(0, MAX_ACCEPTED);
  return { shopId: who.shopId, userId: who.userId, day: who.day, marks, accepted };
}

export function serializePostHold(hold: PostHold): string {
  return JSON.stringify(hold);
}

/**
 * Встать на пост. Тот же пост подряд второй отметкой не пишем: человек жмёт
 * чип своего подъёмника по десять раз на дню, и от этого история переходов
 * не должна расти.
 */
export function addMark(hold: PostHold, postNo: number, at: string): PostHold {
  if (!isPost(postNo) || !HHMM.test(at)) return hold;
  if (currentPost(hold) === postNo) return hold;
  const marks = [...hold.marks, { postNo, at }].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_MARKS);
  return { ...hold, marks };
}

/** Запомнить принятую машину: дальше она его, куда бы её ни перенесли. */
export function addAccepted(hold: PostHold, bookingId: number): PostHold {
  if (!Number.isInteger(bookingId) || bookingId <= 0 || hold.accepted.includes(bookingId)) return hold;
  return { ...hold, accepted: [...hold.accepted, bookingId].slice(-MAX_ACCEPTED) };
}

/** Пост, на котором человек стоит сейчас; null — не отмечался. */
export function currentPost(hold: PostHold | null): number | null {
  return hold?.marks.length ? hold.marks[hold.marks.length - 1].postNo : null;
}

/**
 * Какой пост был занят в момент «ЧЧ:ММ». Последняя отметка не позже этого
 * времени; раньше первой — только в пределах BACKFILL_MIN (см. выше).
 * null — в это время человек на постах не стоял.
 */
export function postAt(marks: readonly PostMark[], at: string): number | null {
  if (marks.length === 0 || !HHMM.test(at)) return null;
  const sorted = [...marks].sort((a, b) => a.at.localeCompare(b.at));
  let found: number | null = null;
  for (const m of sorted) {
    if (m.at <= at) found = m.postNo;
  }
  if (found !== null) return found;
  const first = sorted[0];
  return toMinutes(first.at) - toMinutes(at) <= BACKFILL_MIN ? first.postNo : null;
}
