import "server-only";
// Кто сейчас в приложении: сервис, учётка и роль. Один раз на запрос,
// сколько бы экранов и блоков ни спросили.
//
// Роль читается с самой витрины (lib/shop.ts): своя — owner, чужая — из
// строки сотрудника, которую отдал сайт. Пока маршрута /members/mine на
// сайте нет, в списке только свои витрины, и роль у всех owner — ровно
// сегодняшнее поведение, прав оно не расширяет.
import { cache } from "react";
import { redirect } from "next/navigation";
import { can, HOME_PATH, type Section, type StoRole } from "@/lib/access";
import { currentServiceShop, type ServiceShop } from "@/lib/shop";
import { getServerUser } from "@/lib/supabase/server";

export type ServiceContext = {
  shop: ServiceShop;
  /** Учётка человека — её ждёт каждый запрос к сайту как actorUserId. */
  userId: string;
  role: StoRole;
  /** Мастер, если этот человек стоит на посту: по нему собирается «Мой пост». */
  masterId: number | null;
};

/** Роль человека в витрине: хозяин своей, сотрудник чужой. */
export function roleIn(shop: ServiceShop): { role: StoRole; masterId: number | null } {
  if (shop.owned || !shop.membership) return { role: "owner", masterId: null };
  // Выключенный сотрудник — уволенный: он входит по общей куке сайта, но в
  // приложении ему делать нечего. Сужаем до мастера без поста; сайт всё равно
  // откажет в данных, а отдельного экрана «вас отключили» в дизайне нет.
  if (!shop.membership.active) return { role: "master", masterId: null };
  return { role: shop.membership.role, masterId: shop.membership.masterId };
}

/** null там же, где его отдаёт currentServiceShop: нет входа или нет витрины. */
export const serviceContext = cache(async (): Promise<ServiceContext | null> => {
  const shop = await currentServiceShop();
  const user = await getServerUser();
  if (!shop || !user) return null;
  return { shop, userId: user.id, ...roleIn(shop) };
});

/**
 * Гейт экрана: раздел закрыт роли — уводим на её первый экран, а не
 * показываем пустую страницу. Одна строка в начале page.tsx. Нет сервиса —
 * отдаём null, как serviceContext: layout уже нарисовал «сервис не найден».
 */
export async function requireSection(section: Section): Promise<ServiceContext | null> {
  const ctx = await serviceContext();
  if (!ctx) return null;
  if (!can(ctx.role, section)) redirect(HOME_PATH[ctx.role]);
  return ctx;
}
