// Вход админа сайта в СРМ конкретного сервиса: сюда ведёт кнопка «Войти в
// СРМ» из админки abkhaz-auto (/admin/shops; спека там же —
// docs/superpowers/specs/2026-09-22-sto-admin-access-design.md). Отдельный
// маршрут, а не параметр на главной: куку при рендере RSC поставить нельзя.
//
// Право проверяем здесь один раз, дальше его на каждый запрос перепроверяет
// lib/shop.ts. Не-админа молча уводим на главную: для него этого входа нет, и
// объяснять закрытую дверь незачем. Сессии нет — тоже на главную, там замок
// proxy сам покажет вход.
import { redirect } from "next/navigation";
import { saveAdminShop } from "@/lib/admin-shop-cookie";
import { createSupabaseAdmin, getServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getServerUser();
  const raw = new URL(req.url).searchParams.get("shopId");
  const shopId = Number(raw);
  if (!user || !raw || !Number.isInteger(shopId) || shopId <= 0) redirect("/");
  const { data } = await createSupabaseAdmin().from("profiles")
    .select("is_admin").eq("id", user.id).maybeSingle<{ is_admin: boolean | null }>();
  if (data?.is_admin !== true) redirect("/");
  await saveAdminShop(shopId, user.id);
  // Домашний экран владельца (HOME_PATH.owner) — админ входит его глазами.
  redirect("/svodka");
}
