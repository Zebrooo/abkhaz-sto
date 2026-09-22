import "server-only";
// Где живёт админ-контекст: httpOnly-кука с привязкой к учётке, повадки — как
// у куки примерки роли (role-cookie.ts). Сутки, а не «пока не выйдет»:
// «зайти разобраться» — это визит, а не режим работы, и забытая кука не
// должна неделями держать админа в чужой витрине.
import { cache } from "react";
import { cookies } from "next/headers";
import { ADMIN_SHOP_COOKIE, parseAdminShop, serializeAdminShop } from "@/lib/admin-shop";

const MAX_AGE_S = 24 * 3600;

export const readAdminShop = cache(async (userId: string): Promise<number | null> => {
  const jar = await cookies();
  return parseAdminShop(jar.get(ADMIN_SHOP_COOKIE)?.value, userId);
});

export async function saveAdminShop(shopId: number, userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_SHOP_COOKIE, serializeAdminShop(shopId, userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
  });
}

export async function clearAdminShop(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_SHOP_COOKIE);
}
