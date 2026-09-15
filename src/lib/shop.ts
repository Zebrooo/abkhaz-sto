import "server-only";
import { cache } from "react";
import { createSupabaseAdmin, getServerUser } from "@/lib/supabase/server";
import { normalizeStoPrepay, normalizeStoSchedule, type StoPrepay, type StoSchedule } from "@/lib/sto/schedule";

// Чей это сервис. То же правило, что shop-owner.ts на сайте и
// sto_shop_bookings в базе: витрина принадлежит человеку по user_id ИЛИ по
// телефону учётки (анкету магазина заполняют без входа на сайт, user_id у
// большинства пуст; телефон учётки подтверждён кодом из СМС, у витрины
// уникален и нормализован). Пустой телефон не считается совпадением.
//
// Найдя витрину по телефону, проставляем ей user_id — дальше выборка идёт по
// индексу, а RPC sto_shop_bookings в базе тоже узнает владельца по user_id.

export type ServiceShop = {
  id: number;
  name: string;
  slug: string | null;
  storefrontStatus: string;
  address: string;
  regionSlug: string | null;
  /** null — расписание не задано, записаться нельзя. */
  schedule: StoSchedule | null;
  scheduleRaw: unknown;
  prepay: StoPrepay;
};

type ShopRow = {
  id: number; name: string; slug: string | null; storefront_status: string; address: string | null;
  region_slug: string | null; user_id: string | null; phone: string; status: string; rubric: string | null;
  sto_schedule: unknown; sto_prepay: unknown;
};
const COLUMNS = "id, name, slug, storefront_status, address, region_slug, user_id, phone, status, rubric, sto_schedule, sto_prepay";

function toShop(r: ShopRow): ServiceShop {
  return {
    id: r.id, name: r.name, slug: r.slug, storefrontStatus: r.storefront_status,
    address: r.address ?? "", regionSlug: r.region_slug,
    schedule: normalizeStoSchedule(r.sto_schedule), scheduleRaw: r.sto_schedule,
    prepay: normalizeStoPrepay(r.sto_prepay),
  };
}

/** Сервисы текущего пользователя (одобренные витрины рубрики service). */
export const myServiceShops = cache(async (): Promise<ServiceShop[]> => {
  const user = await getServerUser();
  if (!user) return [];
  const admin = createSupabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  const phone = typeof profile?.phone === "string" && profile.phone.trim() !== "" ? profile.phone : null;
  const or = phone ? `user_id.eq.${user.id},phone.eq.${phone}` : `user_id.eq.${user.id}`;
  const { data, error } = await admin.from("shops").select(COLUMNS)
    .eq("rubric", "service").eq("status", "approved").or(or)
    .order("id").returns<ShopRow[]>();
  if (error) {
    console.error("[сто] не прочитались витрины пользователя:", error.message);
    return [];
  }
  const rows = data ?? [];
  const orphans = rows.filter(r => r.user_id == null).map(r => r.id);
  if (orphans.length > 0) {
    await admin.from("shops").update({ user_id: user.id }).in("id", orphans).is("user_id", null);
  }
  return rows.map(toShop);
});

/**
 * Текущий сервис: первый из своих (несколько витрин у одного человека —
 * редкость, переключатель появится, когда понадобится). null — сервиса нет.
 */
export const currentServiceShop = cache(async (): Promise<ServiceShop | null> => {
  const shops = await myServiceShops();
  return shops[0] ?? null;
});

/** Сервис по id, только если он принадлежит текущему пользователю. */
export async function ownedServiceShop(shopId: number): Promise<ServiceShop | null> {
  const shops = await myServiceShops();
  return shops.find(s => s.id === shopId) ?? null;
}
