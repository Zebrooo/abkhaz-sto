"use server";
// Переключение витрины: у одного человека бывает и автосервис, и магазин
// товаров. Выбор — в куке (lib/shop-cookie.ts), чужую витрину выбрать
// нельзя: берём только из списка доступных, как и везде. После выбора —
// на первый экран новой витрины: адреса у сервиса и магазина разные, и
// оставаться на /svodka в магазине нельзя.
import { redirect } from "next/navigation";
import { homePath } from "@/lib/access";
import { roleIn } from "@/lib/context";
import { myServiceShops } from "@/lib/shop";
import { saveShopChoice } from "@/lib/shop-cookie";
import { getServerUser } from "@/lib/supabase/server";

export async function switchShopAction(fd: FormData) {
  const user = await getServerUser();
  if (!user) redirect("/vhod");
  const shopId = Number(fd.get("shopId"));
  const shop = (await myServiceShops()).find(s => s.id === shopId);
  if (!shop) redirect("/");
  await saveShopChoice(shop.id, user.id);
  redirect(homePath(shop.kind, roleIn(shop).role));
}
