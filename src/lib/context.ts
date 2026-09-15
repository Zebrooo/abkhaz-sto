import "server-only";
// Кто сейчас в приложении: сервис, учётка и роль. Один раз на запрос,
// сколько бы экранов и блоков ни спросили.
//
// ПАДАЕМ В OWNER, А НЕ В MASTER. Пока маршрута членства на сайте нет
// (docs/API-sushchnosti.md), приложение обязано работать как раньше, а как
// раньше — это владелец витрины со всеми правами. Дать в этот момент роль
// поуже значило бы сломать работающий сервис ради ещё не существующего
// разграничения. Прав это не расширяет: сюда доходит только тот, чью витрину
// уже подтвердил currentServiceShop.
import { cache } from "react";
import { fetchMyMembership } from "@/lib/api/members";
import type { StoRole } from "@/lib/access";
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

/** null там же, где его отдаёт currentServiceShop: нет входа или нет витрины. */
export const serviceContext = cache(async (): Promise<ServiceContext | null> => {
  const shop = await currentServiceShop();
  const user = await getServerUser();
  if (!shop || !user) return null;

  const membership = await fetchMyMembership(shop.id, user.id);
  if (!membership.ok) {
    return { shop, userId: user.id, role: "owner", masterId: null };
  }
  // Выключенный сотрудник — уволенный: он входит по общей куке сайта, но в
  // приложении ему делать нечего. Сужаем до мастера без поста; сайт всё равно
  // откажет в данных, а отдельного экрана «вас отключили» в дизайне нет.
  if (!membership.data.active) {
    return { shop, userId: user.id, role: "master", masterId: null };
  }
  return { shop, userId: user.id, role: membership.data.role, masterId: membership.data.masterId };
});
