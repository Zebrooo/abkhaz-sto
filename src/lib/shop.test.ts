import { beforeEach, describe, expect, it, vi } from "vitest";

// Табличный мок supabase-admin: from(таблица) отдаёт записываемый билдер,
// ответ — по таблице и виду запроса (maybeSingle против списка). update
// считаем отдельно: усыновление чужой витрины — то, чего быть не должно.
const mocks = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1" } as { id: string } | null,
    profile: { phone: null, is_admin: true } as Record<string, unknown> | null,
    ownedRows: [] as unknown[],
    /** Ответ на выборку витрин сотрудника — запрос с in("id", …). */
    memberRows: [] as unknown[],
    shopById: null as Record<string, unknown> | null,
    updates: [] as unknown[][],
  };
  const builderFor = (table: string) => {
    let single = false;
    let updating = false;
    let byIds = false;
    const result = () => {
      if (updating) return { data: null, error: null };
      if (table === "profiles") return { data: state.profile, error: null };
      if (table === "shops") {
        if (single) return { data: state.shopById, error: null };
        return { data: byIds ? state.memberRows : state.ownedRows, error: null };
      }
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lt", "gt", "or", "order", "limit", "is"]) {
      b[m] = () => b;
    }
    // in("id", …) — выборка витрин сотрудника; in("rubric", …) есть у всех запросов.
    b.in = (col: string) => { if (col === "id") byIds = true; return b; };
    b.maybeSingle = () => { single = true; return b; };
    b.update = (...args: unknown[]) => { updating = true; state.updates.push(args); return b; };
    b.returns = () => b;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(onF, onR);
    return b;
  };
  return {
    state,
    admin: { from: (table: string) => builderFor(table) },
    getServerUser: vi.fn(async () => state.user),
    fetchMyShops: vi.fn(async () => ({ ok: true as const, data: [] as unknown[] })),
    readAdminShop: vi.fn(async () => null as number | null),
    readShopChoice: vi.fn(async () => null as number | null),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: () => mocks.admin,
  getServerUser: mocks.getServerUser,
}));
vi.mock("@/lib/api/members", () => ({ fetchMyShops: mocks.fetchMyShops }));
vi.mock("@/lib/admin-shop-cookie", () => ({ readAdminShop: mocks.readAdminShop }));
vi.mock("@/lib/shop-cookie", () => ({ readShopChoice: mocks.readShopChoice }));

const ROW = {
  id: 7, name: "Апсны Авто", slug: "apsny", storefront_status: "published",
  address: "Сухум", region_slug: null, user_id: "owner-1", phone: "+79400000001",
  status: "approved", rubric: "service", sto_schedule: null, sto_prepay: null, couriers: null,
};
/** Магазин товаров того же человека — вторая витрина под тем же номером. */
const GOODS_ROW = { ...ROW, id: 9, name: "Цветы «Лилия»", slug: "liliya", rubric: "goods", couriers: [{ id: "c1", name: "Амра", phone: null }] };

// myServiceShops обёрнут в React cache — между тестами модуль перечитываем,
// чтобы кэш одного теста не отвечал за другой.
async function myShops() {
  vi.resetModules();
  const { myServiceShops } = await import("@/lib/shop");
  return myServiceShops();
}

async function current() {
  vi.resetModules();
  const { currentServiceShop } = await import("@/lib/shop");
  return currentServiceShop();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.user = { id: "admin-1" };
  mocks.state.profile = { phone: null, is_admin: true };
  mocks.state.ownedRows = [];
  mocks.state.memberRows = [];
  mocks.state.shopById = null;
  mocks.state.updates = [];
  mocks.fetchMyShops.mockResolvedValue({ ok: true, data: [] });
  mocks.readShopChoice.mockResolvedValue(null);
});

describe("myServiceShops — админ-контекст", () => {
  it("админ-кука: витрина первая, хозяйская, adminEntry; усыновление user_id не зовётся", async () => {
    mocks.readAdminShop.mockResolvedValue(7);
    mocks.state.shopById = ROW;
    const shops = await myShops();
    expect(shops[0]).toMatchObject({ id: 7, owned: true, adminEntry: true, membership: null });
    expect(mocks.readAdminShop).toHaveBeenCalledWith("admin-1");
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("кука есть, а is_admin уже снят — куку и не читаем, витрины нет", async () => {
    mocks.state.profile = { phone: null, is_admin: false };
    mocks.readAdminShop.mockResolvedValue(7);
    mocks.state.shopById = ROW;
    const shops = await myShops();
    expect(shops).toHaveLength(0);
    expect(mocks.readAdminShop).not.toHaveBeenCalled();
  });

  it("витрина из куки пропала или не сервис — молча без неё", async () => {
    mocks.readAdminShop.mockResolvedValue(7);
    mocks.state.shopById = null;
    const shops = await myShops();
    expect(shops).toHaveLength(0);
  });

  it("без куки у обычного человека всё как раньше: adminEntry false", async () => {
    mocks.state.profile = { phone: null };
    mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }];
    const shops = await myShops();
    expect(shops[0]).toMatchObject({ id: 7, owned: true, adminEntry: false });
  });
});

describe("магазин товаров и выбор витрины", () => {
  it("витрина рубрики goods — магазин: kind goods, курьеры разобраны", async () => {
    mocks.state.profile = { phone: null };
    mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }, { ...GOODS_ROW, user_id: "admin-1" }];
    const shops = await myShops();
    expect(shops.map(s => s.kind)).toEqual(["service", "goods"]);
    expect(shops[0].couriers).toEqual([]);
    expect(shops[1].couriers).toEqual([{ id: "c1", name: "Амра", phone: null }]);
  });

  it("кука выбора: текущей становится выбранная витрина, а не первая", async () => {
    mocks.state.profile = { phone: null };
    mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }, { ...GOODS_ROW, user_id: "admin-1" }];
    mocks.readShopChoice.mockResolvedValue(9);
    expect((await current())?.id).toBe(9);
    expect(mocks.readShopChoice).toHaveBeenCalledWith("admin-1");
  });

  it("кука на чужую или пропавшую витрину — первая, как без куки", async () => {
    mocks.state.profile = { phone: null };
    mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }];
    mocks.readShopChoice.mockResolvedValue(9);
    expect((await current())?.id).toBe(7);
  });

  it("без витрин текущей нет, и куку не читаем", async () => {
    mocks.state.profile = { phone: null };
    expect(await current()).toBeNull();
    expect(mocks.readShopChoice).not.toHaveBeenCalled();
  });

  // Контракт goods §0: в магазине товаров сайт пускает только админа и
  // хозяина. Строка «мастер» там — ошибка данных, витрину по ней не открываем.
  it("мастер по списку сотрудников в магазине товаров витрины не получает, админ — получает", async () => {
    mocks.state.profile = { phone: null };
    mocks.fetchMyShops.mockResolvedValue({ ok: true, data: [
      { shopId: 9, role: "master", masterId: null, active: true },
      { shopId: 10, role: "admin", masterId: null, active: true },
    ] });
    mocks.state.memberRows = [{ ...GOODS_ROW, user_id: "other" }, { ...GOODS_ROW, id: 10, user_id: "other" }];
    const shops = await myShops();
    expect(shops.map(s => s.id)).toEqual([10]);
    expect(shops[0]).toMatchObject({ kind: "goods", owned: false, membership: { role: "admin" } });
  });
});
