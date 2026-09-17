import "server-only";
// День глазами мастера: записи, привязки и справочник мастеров — одним
// походом, один раз на запрос. Спрашивают трое — оболочка (вкладка «Осмотр»
// ведёт на текущую запись), «Мой пост» и «Ещё» (число отчётов рядом с
// пунктом «Мои отчёты»), и без cache каждый ходил бы на сайт сам.
//
// Отказ сайта — не ошибка экрана: без привязок записи считаются по посту,
// без справочника мастер остаётся без имени и поста, а не без экрана.
import { cache } from "react";
import { dayBookings } from "@/lib/bookings";
import { fetchBookingMasters, fetchMasters, type BookingMaster, type StoMaster } from "@/lib/api/masters";
import { listOr } from "@/lib/api/site-api";
import type { ServiceContext } from "@/lib/context";
import { addDays } from "@/lib/format";
import { inspectTarget, masterBookings } from "@/lib/mywork";
import { currentPost } from "@/lib/post-hold";
import { readPostHold } from "@/lib/post-cookie";
import type { PostHold } from "@/lib/post-hold";
import { isLive } from "@/lib/stats";
import { localTime } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";

export type MasterDay = {
  /** Все записи сервиса за день. */
  rows: StoBookingRow[];
  /** Привязки «запись → мастер» за день; пусто, пока сайт их не отдаёт. */
  links: BookingMaster[];
  masters: StoMaster[];
  /** Строка справочника этого человека; null — учётка не привязана к мастеру или сайт не ответил. */
  me: StoMaster | null;
  /** Живые записи, за которые отвечает мастер, по времени. */
  mine: StoBookingRow[];
  /** Сегодняшняя отметка «занял подъёмник»; null — не отмечался. */
  hold: PostHold | null;
  /** Где человек стоит сейчас: отметка, иначе закрепление справочника. */
  postNo: number | null;
  /**
   * Почему справочник пуст, если он пуст не по-честному. null — сайт ответил
   * (в том числе «мастеров ещё не заводили»), строка — не ответил, и экран
   * обязан сказать это вслух: «мастеров нет» и «мы их не спросили» выглядят
   * одинаково, а делать в этих случаях надо разное.
   */
  mastersErr: string | null;
};

export const masterDay = cache(async (ctx: ServiceContext, day: string): Promise<MasterDay> => {
  const from = localTime(day, "00:00");
  const to = localTime(addDays(day, 1), "00:00");
  const q = { shopId: ctx.shop.id, actorUserId: ctx.userId, from: from.toISOString(), to: to.toISOString() };
  // Отметка лежит в куке — читается без сети и решает, чьи записи считать.
  const hold = await readPostHold(ctx, day);
  const [rows, links, masters] = await Promise.all([
    dayBookings(ctx.shop.id, day),
    fetchBookingMasters(q),
    fetchMasters(ctx.shop.id, ctx.userId),
  ]);
  const list = listOr(masters);
  const pairs = listOr(links);
  // not_found — обычное состояние нового сервиса, а не отказ (AGENTS.md).
  const mastersErr = !masters.ok && masters.code !== "not_found" ? masters.error : null;
  const me = ctx.masterId === null ? null : (list.find(m => m.id === ctx.masterId) ?? null);
  // ПРИОРИТЕТ ИСТОЧНИКОВ «ЧЕЙ ПОСТ», в одном месте:
  //  1) сегодняшние отметки со временем (человек сам сказал, где стоит);
  //  2) закрепление в справочнике — им живут мастера, которые не отмечались.
  // Привязка записи к мастеру перекрывает оба (правило внутри masterBookings),
  // а принятая машина остаётся за принявшим независимо от поста.
  // Пустая отметка (человек нажал «уйти со смены») — это НЕ «отметок не
  // было»: закрепление справочника в этом случае не подставляем, иначе
  // «смена закрыта», а записи поста продолжают показываться.
  const post = hold ? (hold.marks.length > 0 ? hold.marks : null) : (me?.postNo ?? null);
  // masterId может быть null — сегодня он такой у всех, пока сайт не отдаёт
  // справочника. Отметка на подъёмнике обязана работать и в этом случае,
  // иначе экран мастера пуст у всех.
  const mine = masterBookings(rows, pairs, ctx.masterId, post, hold?.accepted ?? []);
  return {
    rows, links: pairs, masters: list, me, mine, hold, mastersErr,
    postNo: currentPost(hold) ?? me?.postNo ?? null,
  };
});

/**
 * Куда ведёт «Осмотр» из вкладок и левого меню: мастеру — на осмотр его
 * текущей записи, админу и хозяину — на ту, что идёт сейчас на любом посту.
 *
 * ОСМАТРИВАТЬ НЕЧЕГО — ВЕДЁМ К ГОТОВЫМ ОТЧЁТАМ, а не в календарь. Пункт
 * называется «Осмотр и отчёты», и хозяин жал его именно ради отчётов; пустая
 * сетка дня на это не отвечала — «перекидывает на календарь, не вижу, где
 * посмотреть отчёты». У мастера свой пост остаётся: отчёты за смену видны
 * внизу того же экрана.
 */
export async function inspectHref(ctx: ServiceContext, day: string, now: Date): Promise<string> {
  // Отметился на подъёмнике — ведём к машине СВОЕГО поста, кем бы человек ни
  // числился: хозяин маленького сервиса тоже стоит у подъёмника. Отметка
  // только сужает выбор, ветка по роли и запасные адреса остаются прежними.
  const { mine } = await masterDay(ctx, day);
  const own = inspectTarget(mine, now);
  if (own) return `/zapis/${own.id}/osmotr`;
  if (ctx.role === "master") return "/moi-raboty";
  const rows = await dayBookings(ctx.shop.id, day);
  const target = inspectTarget(rows.filter(isLive), now);
  return target ? `/zapis/${target.id}/osmotr` : "/otchety";
}
