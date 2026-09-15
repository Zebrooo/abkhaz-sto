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
};

export const masterDay = cache(async (ctx: ServiceContext, day: string): Promise<MasterDay> => {
  const from = localTime(day, "00:00");
  const to = localTime(addDays(day, 1), "00:00");
  const q = { shopId: ctx.shop.id, actorUserId: ctx.userId, from: from.toISOString(), to: to.toISOString() };
  const [rows, links, masters] = await Promise.all([
    dayBookings(ctx.shop.id, day),
    fetchBookingMasters(q),
    fetchMasters(ctx.shop.id, ctx.userId),
  ]);
  const list = listOr(masters);
  const pairs = listOr(links);
  const me = ctx.masterId === null ? null : (list.find(m => m.id === ctx.masterId) ?? null);
  const mine = ctx.masterId === null ? [] : masterBookings(rows, pairs, ctx.masterId, me?.postNo ?? null);
  return { rows, links: pairs, masters: list, me, mine };
});

/**
 * Куда ведёт «Осмотр» из вкладок и левого меню: мастеру — на осмотр его
 * текущей записи, админу и хозяину — на ту, что идёт сейчас на любом посту.
 * Осматривать нечего — мастера возвращаем на его пост, остальных в «Записи».
 */
export async function inspectHref(ctx: ServiceContext, day: string, now: Date): Promise<string> {
  if (ctx.role === "master") {
    const { mine } = await masterDay(ctx, day);
    const target = inspectTarget(mine, now);
    return target ? `/zapis/${target.id}/osmotr` : "/moi-raboty";
  }
  const rows = await dayBookings(ctx.shop.id, day);
  const target = inspectTarget(rows.filter(isLive), now);
  return target ? `/zapis/${target.id}/osmotr` : "/segodnya";
}
