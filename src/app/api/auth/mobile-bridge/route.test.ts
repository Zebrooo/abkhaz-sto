import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  cookieStore: { getAll: vi.fn(() => []), set: vi.fn() },
  setAllCapture: null as null | ((toSet: { name: string; value: string; options: Record<string, unknown> }[]) => void),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: typeof mocks.setAllCapture } }) => {
    mocks.setAllCapture = opts.cookies.setAll;
    return { auth: { setSession: mocks.setSession } };
  },
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("https://business.abkhaz-auto.ru/api/auth/mobile-bridge", {
  method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sb.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  mocks.setSession.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("POST /api/auth/mobile-bridge (приложение СТО)", () => {
  it("кривое тело или без токенов — 400, GoTrue не трогаем", async () => {
    expect((await post("{oops")).status).toBe(400);
    expect((await post({ access_token: "a" })).status).toBe(400);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("валидные токены — setSession и кука на ответ; пачка «удалить сессию» пропускается", async () => {
    const res = await post({ access_token: "a", refresh_token: "r" });
    expect(res.status).toBe(200);
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    mocks.setAllCapture!([{ name: "aa-auth-token", value: "v", options: { path: "/" } }]);
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("aa-auth-token", "v", { path: "/" });
    mocks.cookieStore.set.mockClear();
    mocks.setAllCapture!([{ name: "aa-auth-token", value: "", options: {} }]);
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("недействительная сессия — 401; сбой GoTrue, 429 и refresh_token_already_used — 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.setSession.mockResolvedValueOnce({ data: { user: null }, error: { message: "bad jwt", status: 400 } });
    expect((await post({ access_token: "a", refresh_token: "r" })).status).toBe(401);
    mocks.setSession.mockResolvedValueOnce({ data: { user: null }, error: { message: "down", status: 503 } });
    expect((await post({ access_token: "a", refresh_token: "r" })).status).toBe(503);
    mocks.setSession.mockResolvedValueOnce({ data: { user: null }, error: { message: "slow", status: 429 } });
    const r = await post({ access_token: "a", refresh_token: "r" });
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("30");
    mocks.setSession.mockResolvedValueOnce({ data: { user: null }, error: { message: "used", status: 400, code: "refresh_token_already_used" } });
    expect((await post({ access_token: "a", refresh_token: "r" })).status).toBe(503);
  });
});
