import { beforeEach, describe, expect, it, vi } from "vitest";

// Табличный мок supabase-admin: from(таблица) отдаёт записываемый билдер,
// ответ — по таблице и виду запроса (maybeSingle против списка). update
// считаем отдельно: усыновление чужой витрины — то, чего быть не должно.
const mocks = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1" } as { id: string } | null,
    profile: { phone: null, is_admin: true } as Record<string, unknown> | null,
    ownedRows: [] as unknown[],
    shopById: null as Record<string, unknown> | null,
    updates: [] as unknown[][],
  };
  const builderFor = (table: string) => {
    let single = false;
    let updating = false;
    const result = () => {
      if (updating) return { data: null, error: null };
      if (table === "profiles") return { data: state.profile, error: null };
      if (table === "shops") return single ? { data: state.shopById, error: null } : { data: state.ownedRows, error: null };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lt", "gt", "or", "order", "limit", "in", "is"]) {
      b[m] = () => b;
    }
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
    fetchMyShops: vi.fn(async () => ({ ok: true as const, data: [] })),
    readAdminShop: vi.fn(async () => null as number | null),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: () => mocks.admin,
  getServerUser: mocks.getServerUser,
}));
vi.mock("@/lib/api/members", () => ({ fetchMyShops: mocks.fetchMyShops }));
vi.mock("@/lib/admin-shop-cookie", () => ({ readAdminShop: mocks.readAdminShop }));

const ROW = {
  id: 7, name: "Апсны Авто", slug: "apsny", storefront_status: "published",
  address: "Сухум", region_slug: null, user_id: "owner-1", phone: "+79400000001",
  status: "approved", rubric: "service", sto_schedule: null, sto_prepay: null,
};

// myServiceShops обёрнут в React cache — между тестами модуль перечитываем,
// чтобы кэш одного теста не отвечал за другой.
async function myShops() {
  vi.resetModules();
  const { myServiceShops } = await import("@/lib/shop");
  return myServiceShops();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.user = { id: "admin-1" };
  mocks.state.profile = { phone: null, is_admin: true };
  mocks.state.ownedRows = [];
  mocks.state.shopById = null;
  mocks.state.updates = [];
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
