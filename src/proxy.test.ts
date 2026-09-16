import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

import { proxy } from "./proxy";
import type { NextRequest } from "next/server";

/** Минимальный запрос: proxy читает только nextUrl и cookies. */
const req = (path: string): NextRequest => {
  const href = "https://business.abkhaz-auto.ru" + path;
  const url = new URL(href) as URL & { clone: () => URL };
  url.clone = () => new URL(href);
  return { nextUrl: url, cookies: { getAll: () => [], set: () => {} } } as unknown as NextRequest;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sb.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("proxy: что видит гость", () => {
  // Мобильная оболочка отменяет любой переход на путь, начинающийся с /vhod,
  // чтобы показать свой нативный вход. У приложения автосервиса все вкладки —
  // защищённые пути, поэтому редирект туда запирал человека на белом экране:
  // переход отменён, документ не открыт, загрузка не заканчивается никогда.
  it("защищённый путь отдаёт страницу входа НА МЕСТЕ, без редиректа на /vhod", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(req("/segodnya"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/vhod");
  });

  it("гостю на /kalendar — то же самое, адрес в строке не меняется", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(req("/kalendar"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/vhod");
  });

  it("сам /vhod, здоровье и мост проходят без проверки сессии", async () => {
    for (const p of ["/vhod", "/api/health/live", "/api/auth/mobile-bridge"]) {
      const res = await proxy(req(p));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("вошедшего пропускаем как есть", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await proxy(req("/segodnya"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });
});
