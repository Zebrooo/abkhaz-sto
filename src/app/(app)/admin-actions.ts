"use server";
// Выход админа сайта из чужой витрины: чистим куку и уходим на корень —
// дальше человек увидит свои витрины или «сервиса нет», как при обычном
// входе. Отдельный файл, как view-actions.ts: действие зовут и полоса
// (components/AdminBar.tsx), и пункт в «Ещё».
import { redirect } from "next/navigation";
import { clearAdminShop } from "@/lib/admin-shop-cookie";

export async function leaveAdminShopAction(): Promise<void> {
  await clearAdminShop();
  redirect("/");
}
