import "server-only";
// Где живёт выбор витрины: httpOnly-кука с привязкой к учётке, повадки — как
// у куки примерки роли (role-cookie.ts). Полгода, а не сутки: это выбор
// рабочего места («я сейчас в магазине»), а не визит, и терять его каждое
// утро незачем. Кодек и объяснение — lib/shop-choice.ts.
import { cache } from "react";
import { cookies } from "next/headers";
import { parseShopChoice, serializeShopChoice, SHOP_COOKIE } from "@/lib/shop-choice";

const MAX_AGE_S = 180 * 24 * 3600;

export const readShopChoice = cache(async (userId: string): Promise<number | null> => {
  const jar = await cookies();
  return parseShopChoice(jar.get(SHOP_COOKIE)?.value, userId);
});

export async function saveShopChoice(shopId: number, userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SHOP_COOKIE, serializeShopChoice(shopId, userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
  });
}

export async function clearShopChoice(): Promise<void> {
  const jar = await cookies();
  jar.delete(SHOP_COOKIE);
}
