import "server-only";
// Где живёт отметка «я занял подъёмник»: кука устройства мастера.
//
// ПОЧЕМУ КУКА, А НЕ САЙТ. Своей схемы у приложения нет (AGENTS.md), а на
// сайте «мастер стоит на посту с 09:05» не хранится: в справочнике есть
// только постоянное закрепление postNo, и правит его хозяин. Ждать маршрута
// значит не дать мастеру работать сегодня. Поэтому отметка — на устройстве:
// она у каждого своя (двое на разных постах не мешают друг другу), переживает
// перезагрузку и живёт ровно один день сервиса.
//
// Что при этом уходит на сайт: при каждой отметке приложение best-effort
// шлёт masters/update (postNo + onShift), чтобы хозяин на своём экране видел,
// кто где стоит. Отказ сайта отметку не отменяет — она уже работает.
//
// Кука техническая: телефонов и имён в ней нет, только номер сервиса,
// учётка, день, номера постов со временем и номера принятых записей.
import { cache } from "react";
import { cookies } from "next/headers";
import type { ServiceContext } from "@/lib/context";
import {
  addAccepted, addMark, emptyHold, parsePostHold, serializePostHold, type PostHold,
} from "@/lib/post-hold";
import { localHHMM, localTime } from "@/lib/sto/slots";
import { addDays } from "@/lib/format";

export const POST_COOKIE = "sto-post";

/**
 * Отметка этого человека за этот день; null — не отмечался. cache() на
 * запрос: за отметкой ходят и оболочка (вкладка «Осмотр»), и «Мой пост», и
 * экран осмотра.
 */
export const readPostHold = cache(async (ctx: ServiceContext, day: string): Promise<PostHold | null> => {
  const jar = await cookies();
  return parsePostHold(jar.get(POST_COOKIE)?.value, { shopId: ctx.shop.id, userId: ctx.userId, day });
});

/**
 * Срок куки — до конца суток сервиса плюс запас: ночная смена не должна
 * терять пост посреди машины, а завтрашний день отметку всё равно не
 * прочитает (в ней записан день).
 */
function expiresAt(day: string): Date {
  return new Date(localTime(addDays(day, 1), "00:00").getTime() + 3 * 3_600_000);
}

async function write(ctx: ServiceContext, day: string, hold: PostHold): Promise<void> {
  const jar = await cookies();
  jar.set(POST_COOKIE, serializePostHold(hold), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt(day),
  });
}

/** Встать на пост: дописывает отметку со временем и возвращает новую запись. */
export async function savePostMark(ctx: ServiceContext, day: string, postNo: number, now: Date): Promise<PostHold> {
  const base = (await readPostHold(ctx, day)) ?? emptyHold({ shopId: ctx.shop.id, userId: ctx.userId, day });
  const hold = addMark(base, postNo, localHHMM(now));
  await write(ctx, day, hold);
  return hold;
}

/** Запомнить принятую машину — она остаётся за принявшим, куда бы её ни перенесли. */
export async function saveAccepted(ctx: ServiceContext, day: string, bookingId: number): Promise<void> {
  const base = (await readPostHold(ctx, day)) ?? emptyHold({ shopId: ctx.shop.id, userId: ctx.userId, day });
  await write(ctx, day, addAccepted(base, bookingId));
}

/** Уйти со смены: отметка снимается целиком. */
export async function dropPostHold(): Promise<void> {
  const jar = await cookies();
  jar.delete(POST_COOKIE);
}
