import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createSupabaseAdmin: vi.fn(),
  saveAdminShop: vi.fn(),
  redirect: vi.fn((to: string) => { throw new Error("REDIRECT:" + to); }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: mocks.getServerUser,
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));
vi.mock("@/lib/admin-shop-cookie", () => ({ saveAdminShop: mocks.saveAdminShop }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { GET } from "./route";

const req = (q: string) => new Request(`https://business.abkhaz-auto.ru/admin-vhod${q}`);
const profileAdmin = (is_admin: boolean | null) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_admin }, error: null }) }) }) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue({ id: "u1" });
  mocks.createSupabaseAdmin.mockReturnValue(profileAdmin(true));
});

describe("GET /admin-vhod", () => {
  it("админ с shopId — кука и redirect на /svodka", async () => {
    await expect(GET(req("?shopId=7"))).rejects.toThrow("REDIRECT:/svodka");
    expect(mocks.saveAdminShop).toHaveBeenCalledWith(7, "u1");
  });

  it("не админ — на главную, куки нет", async () => {
    mocks.createSupabaseAdmin.mockReturnValue(profileAdmin(false));
    await expect(GET(req("?shopId=7"))).rejects.toThrow("REDIRECT:/");
    expect(mocks.saveAdminShop).not.toHaveBeenCalled();
  });

  it("кривой или пустой shopId — на главную, базу не спрашиваем", async () => {
    for (const q of ["?shopId=abc", "?shopId=7.5", "?shopId=-7", "?shopId=0", ""]) {
      await expect(GET(req(q))).rejects.toThrow("REDIRECT:/");
    }
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.saveAdminShop).not.toHaveBeenCalled();
  });

  it("без входа — на главную (замок proxy покажет вход сам)", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    await expect(GET(req("?shopId=7"))).rejects.toThrow("REDIRECT:/");
    expect(mocks.saveAdminShop).not.toHaveBeenCalled();
  });
});
