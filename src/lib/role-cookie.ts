import "server-only";
// Где живёт примерка роли: кука устройства, как и отметка на подъёмнике.
//
// ПОЧЕМУ КУКА, А НЕ АДРЕС. Гейт разделов уводит человека на первый экран его
// роли (requireSection), серверные действия возвращают его своим набором
// параметров — ?role= в адресе терялся бы на первом же переходе, и роль
// мигала бы. Кука переживает переходы и живёт ровно до конца примерки.
//
// Кука техническая и ничего не открывает: в ней номер сервиса, учётка и
// роль, а сузить себя может только хозяин (lib/role-view.ts). Запросы к
// сайту по-прежнему уходят с настоящим actorUserId — примерка меняет только
// то, что нарисовано на экране.
import { cache } from "react";
import { cookies } from "next/headers";
import { parseRoleView, serializeRoleView, type RoleView, type ViewableRole } from "@/lib/role-view";

export const VIEW_COOKIE = "sto-view";

/** Сутки: примерка — это «посмотреть сейчас», а не режим работы. */
const MAX_AGE_S = 24 * 3600;

export const readRoleView = cache(async (who: { shopId: number; userId: string }): Promise<RoleView | null> => {
  const jar = await cookies();
  return parseRoleView(jar.get(VIEW_COOKIE)?.value, who);
});

export async function saveRoleView(who: { shopId: number; userId: string }, role: ViewableRole): Promise<void> {
  const jar = await cookies();
  jar.set(VIEW_COOKIE, serializeRoleView({ ...who, role }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
  });
}

export async function clearRoleView(): Promise<void> {
  const jar = await cookies();
  jar.delete(VIEW_COOKIE);
}
