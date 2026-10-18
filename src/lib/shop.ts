import "server-only";
import { cache } from "react";
import { createSupabaseAdmin, getServerUser } from "@/lib/supabase/server";
import { readAdminShop } from "@/lib/admin-shop-cookie";
import { fetchMyShops, type MyShopMembership } from "@/lib/api/members";
import { listOr } from "@/lib/api/site-api";
import { ownerFilter } from "@/lib/shop-owner";
import { readShopChoice } from "@/lib/shop-cookie";
import { parseCouriers, type ShopCourier } from "@/lib/couriers";
import type { ShopKind } from "@/lib/access";
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
//
// ДВА ВИДА ВИТРИН. С 18.10.2026 приложение открывает и магазин товаров
// (rubric = 'goods', контракт /api/sto/goods/*): владение и членство те же,
// разделы другие. Вид витрины (kind) решает, какие вкладки рисовать и какой
// гейт пускает на экран (lib/context.ts). Вертикаль магазина (цветы,
// электроника) из базы НЕ читаем — колонка сайта, её отдаёт /goods/settings.

export type ServiceShop = {
  id: number;
  name: string;
  slug: string | null;
  /** Автосервис или магазин товаров — по рубрике витрины. */
  kind: ShopKind;
  storefrontStatus: string;
  address: string;
  regionSlug: string | null;
  /** null — расписание не задано, записаться нельзя. */
  schedule: StoSchedule | null;
  scheduleRaw: unknown;
  prepay: StoPrepay;
  /** Свои курьеры магазина (shops.couriers) — для шага «Курьеру» при своей доставке. */
  couriers: ShopCourier[];
  /** Витрина этого человека — он в ней хозяин, что бы ни говорил список сотрудников. */
  owned: boolean;
  /** Строка сотрудника, если пришёл не как владелец. */
  membership: MyShopMembership | null;
  /** Витрина открыта админом сайта через /admin-vhod: он тут владелец на время визита. */
  adminEntry: boolean;
};

type ShopRow = {
  id: number; name: string; slug: string | null; storefront_status: string; address: string | null;
  region_slug: string | null; user_id: string | null; phone: string; status: string; rubric: string | null;
  sto_schedule: unknown; sto_prepay: unknown; couriers: unknown;
};
const COLUMNS = "id, name, slug, storefront_status, address, region_slug, user_id, phone, status, rubric, sto_schedule, sto_prepay, couriers";
/** Рубрики, которые открывает приложение: автосервис и магазин товаров. */
const RUBRICS = ["service", "goods"];

function toShop(r: ShopRow, owned: boolean, membership: MyShopMembership | null): ServiceShop {
  return {
    id: r.id, name: r.name, slug: r.slug, kind: r.rubric === "goods" ? "goods" : "service",
    storefrontStatus: r.storefront_status,
    address: r.address ?? "", regionSlug: r.region_slug,
    schedule: normalizeStoSchedule(r.sto_schedule), scheduleRaw: r.sto_schedule,
    prepay: normalizeStoPrepay(r.sto_prepay),
    couriers: parseCouriers(r.couriers),
    owned, membership, adminEntry: false,
  };
}

/** Сервисы текущего пользователя: свои витрины первыми, затем те, где он сотрудник. */
export const myServiceShops = cache(async (): Promise<ServiceShop[]> => {
  const user = await getServerUser();
  if (!user) return [];
  const admin = createSupabaseAdmin();
  // Телефон учётки и список членств независимы — одной пачкой; витрины по
  // телефону спрашиваем после: ownerFilter ждёт номер.
  const [profileRes, memberships] = await Promise.all([
    admin.from("profiles").select("phone, is_admin").eq("id", user.id).maybeSingle(),
    fetchMyShops(user.id).then(listOr),
  ]);
  const or = ownerFilter(user.id, typeof profileRes.data?.phone === "string" ? profileRes.data.phone : null);

  const ownedRes = await admin.from("shops").select(COLUMNS).in("rubric", RUBRICS).eq("status", "approved").or(or).order("id").returns<ShopRow[]>();
  if (ownedRes.error) {
    console.error("[сто] не прочитались витрины пользователя:", ownedRes.error.message);
  }
  const ownedRows = ownedRes.data ?? [];
  const orphans = ownedRows.filter(r => r.user_id == null).map(r => r.id);
  if (orphans.length > 0) {
    await admin.from("shops").update({ user_id: user.id }).in("id", orphans).is("user_id", null);
  }
  const owned = ownedRows.map(r => toShop(r, true, null));

  // Витрина, куда вошёл админ сайта (/admin-vhod): первая и хозяйская, но
  // ПОСЛЕ ветки усыновления и отдельным запросом — витрина не его, и её
  // user_id закреплять нельзя. is_admin проверяем каждый запрос: кука
  // переживает отзыв прав, а права — нет.
  const adminShopId = profileRes.data?.is_admin === true ? await readAdminShop(user.id) : null;
  if (adminShopId != null && !owned.some(s => s.id === adminShopId)) {
    const { data: adminRow } = await admin.from("shops").select(COLUMNS)
      .in("rubric", RUBRICS).eq("status", "approved").eq("id", adminShopId)
      .maybeSingle<ShopRow>();
    if (adminRow) owned.unshift({ ...toShop(adminRow, true, null), adminEntry: true });
  }

  // Сотрудник — только в чужих витринах: своя и так первая, и хозяином.
  // Выключенный (уволенный) не получает витрину вовсе: записи приложение
  // читает из общей базы напрямую, мимо сайта, и роль «мастер без поста»
  // оставила бы ему все записи с телефонами клиентов. Для него сервиса нет.
  const ownedIds = new Set(owned.map(s => s.id));
  const foreign = memberships.filter(m => m.active && !ownedIds.has(m.shopId));
  if (foreign.length === 0) return owned;

  // Витрина обязана быть одобренной и нашей рубрики — как и для владельца:
  // список сотрудников не открывает того, чего нет на площадке.
  const { data: memberRows, error } = await admin.from("shops").select(COLUMNS)
    .in("rubric", RUBRICS).eq("status", "approved").in("id", foreign.map(m => m.shopId))
    .order("id").returns<ShopRow[]>();
  if (error) {
    console.error("[сто] не прочитались витрины сотрудника:", error.message);
    return owned;
  }
  const byId = new Map(foreign.map(m => [m.shopId, m]));
  return owned.concat((memberRows ?? []).flatMap(r => {
    const m = byId.get(r.id) ?? null;
    // В магазине товаров роли «мастер» нет (контракт goods §0: сайт пускает
    // только админа и хозяина). Такая строка — ошибка данных, и открывать
    // по ней витрину нельзя: ни одного экрана магазина мастеру не положено.
    if (r.rubric === "goods" && m?.role === "master") return [];
    return [toShop(r, false, m)];
  }));
});

/**
 * Текущая витрина: выбранная кукой (lib/shop-cookie.ts), если она среди
 * доступных, иначе первая из своих. Сервис и магазин у одного человека —
 * обычное дело с приходом магазинов товаров, и переключатель живёт в «Ещё»
 * и в шапке веба. null — витрины нет.
 */
export const currentServiceShop = cache(async (): Promise<ServiceShop | null> => {
  const shops = await myServiceShops();
  if (shops.length === 0) return null;
  // getServerUser кэширован на запрос — второй вызов в GoTrue не ходит.
  const user = await getServerUser();
  const chosen = user ? await readShopChoice(user.id) : null;
  return shops.find(s => s.id === chosen) ?? shops[0];
});

/** Сервис по id, только если текущему пользователю в нём есть место — хозяином или сотрудником. */
export async function accessibleServiceShop(shopId: number): Promise<ServiceShop | null> {
  const shops = await myServiceShops();
  return shops.find(s => s.id === shopId) ?? null;
}
