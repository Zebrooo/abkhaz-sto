import "server-only";
import { cache } from "react";
import { createSupabaseAdmin, getServerUser } from "@/lib/supabase/server";
import { fetchMyShops, type MyShopMembership } from "@/lib/api/members";
import { listOr } from "@/lib/api/site-api";
import { ownerFilter } from "@/lib/shop-owner";
import { normalizeStoPrepay, normalizeStoSchedule, type StoPrepay, type StoSchedule } from "@/lib/sto/schedule";

// Чей это сервис. Два пути внутрь.
//
// ВЛАДЕНИЕ — то же правило, что shop-owner.ts на сайте и sto_shop_bookings в
// базе: витрина принадлежит человеку по user_id ИЛИ по телефону учётки
// (анкету магазина заполняют без входа на сайт, user_id у большинства пуст;
// телефон учётки подтверждён кодом из СМС, у витрины уникален и
// нормализован). В profiles номер лежит без плюса — к E.164 его приводит
// ownerFilter (shop-owner.ts), и только проверенный номер попадает в or().
// Пустой или кривой телефон не считается совпадением. Найдя витрину по
// телефону, проставляем ей user_id — дальше выборка идёт по индексу, а RPC
// sto_shop_bookings в базе тоже узнает владельца по user_id.
//
// ЧЛЕНСТВО — мастер и админ витрины не имеют, их пускает список сотрудников
// с сайта (lib/api/members.ts, /members/mine). Без него роли были бы
// мертвы: человек входил бы по общей куке и упирался в «сервис не найден».
// Сайт молчит — остаётся один путь, владение, ровно как было до ролей.

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
  /** Витрина этого человека — он в ней хозяин, что бы ни говорил список сотрудников. */
  owned: boolean;
  /** Строка сотрудника, если пришёл не как владелец. */
  membership: MyShopMembership | null;
};

type ShopRow = {
  id: number; name: string; slug: string | null; storefront_status: string; address: string | null;
  region_slug: string | null; user_id: string | null; phone: string; status: string; rubric: string | null;
  sto_schedule: unknown; sto_prepay: unknown;
};
const COLUMNS = "id, name, slug, storefront_status, address, region_slug, user_id, phone, status, rubric, sto_schedule, sto_prepay";

function toShop(r: ShopRow, owned: boolean, membership: MyShopMembership | null): ServiceShop {
  return {
    id: r.id, name: r.name, slug: r.slug, storefrontStatus: r.storefront_status,
    address: r.address ?? "", regionSlug: r.region_slug,
    schedule: normalizeStoSchedule(r.sto_schedule), scheduleRaw: r.sto_schedule,
    prepay: normalizeStoPrepay(r.sto_prepay),
    owned, membership,
  };
}

/** Сервисы текущего пользователя: свои витрины первыми, затем те, где он сотрудник. */
export const myServiceShops = cache(async (): Promise<ServiceShop[]> => {
  const user = await getServerUser();
  if (!user) return [];
  const admin = createSupabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  const or = ownerFilter(user.id, typeof profile?.phone === "string" ? profile.phone : null);

  const [ownedRes, memberships] = await Promise.all([
    admin.from("shops").select(COLUMNS).eq("rubric", "service").eq("status", "approved").or(or).order("id").returns<ShopRow[]>(),
    fetchMyShops(user.id).then(listOr),
  ]);
  if (ownedRes.error) {
    console.error("[сто] не прочитались витрины пользователя:", ownedRes.error.message);
  }
  const ownedRows = ownedRes.data ?? [];
  const orphans = ownedRows.filter(r => r.user_id == null).map(r => r.id);
  if (orphans.length > 0) {
    await admin.from("shops").update({ user_id: user.id }).in("id", orphans).is("user_id", null);
  }
  const owned = ownedRows.map(r => toShop(r, true, null));

  // Сотрудник — только в чужих витринах: своя и так первая, и хозяином.
  // Выключенный (уволенный) не получает витрину вовсе: записи приложение
  // читает из общей базы напрямую, мимо сайта, и роль «мастер без поста»
  // оставила бы ему все записи с телефонами клиентов. Для него сервиса нет.
  const ownedIds = new Set(owned.map(s => s.id));
  const foreign = memberships.filter(m => m.active && !ownedIds.has(m.shopId));
  if (foreign.length === 0) return owned;

  // Витрина обязана быть одобренной и рубрики service — как и для владельца:
  // список сотрудников не открывает того, чего нет на площадке.
  const { data: memberRows, error } = await admin.from("shops").select(COLUMNS)
    .eq("rubric", "service").eq("status", "approved").in("id", foreign.map(m => m.shopId))
    .order("id").returns<ShopRow[]>();
  if (error) {
    console.error("[сто] не прочитались витрины сотрудника:", error.message);
    return owned;
  }
  const byId = new Map(foreign.map(m => [m.shopId, m]));
  return owned.concat((memberRows ?? []).map(r => toShop(r, false, byId.get(r.id) ?? null)));
});

/**
 * Текущий сервис: первый из своих (несколько витрин у одного человека —
 * редкость, переключатель появится, когда понадобится). null — сервиса нет.
 */
export const currentServiceShop = cache(async (): Promise<ServiceShop | null> => {
  const shops = await myServiceShops();
  return shops[0] ?? null;
});

/** Сервис по id, только если текущему пользователю в нём есть место — хозяином или сотрудником. */
export async function accessibleServiceShop(shopId: number): Promise<ServiceShop | null> {
  const shops = await myServiceShops();
  return shops.find(s => s.id === shopId) ?? null;
}
