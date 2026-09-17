import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  serviceContext: vi.fn(),
  clearPostMarks: vi.fn(),
  jar: {
    all: [] as { name: string; value: string }[],
    getAll: vi.fn(() => mocks.jar.all),
    set: vi.fn(),
    delete: vi.fn(),
  },
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/lib/context", () => ({ serviceContext: mocks.serviceContext }));
vi.mock("@/lib/post-cookie", () => ({ clearPostMarks: mocks.clearPostMarks }));

import { logoutAction } from "./auth-actions";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookies";
import { VIEW_COOKIE } from "@/lib/role-cookie";

/** Действие всегда заканчивается редиректом — он бросает, как в Next. */
const logout = () => logoutAction().catch((e: Error) => e.message);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.all = [
    { name: AUTH_COOKIE_NAME, value: "session" },
    { name: `${AUTH_COOKIE_NAME}.0`, value: "chunk" },
    { name: "sto-other", value: "not mine" },
  ];
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.serviceContext.mockResolvedValue({ shop: { id: 7 }, userId: "u1" });
});

// Домен куки читается при загрузке модуля — переменную за собой убираем,
// чтобы она не утекла в соседние файлы.
afterEach(() => { delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN; });

describe("logoutAction", () => {
  // Кука выдана на .abkhaz-auto.ru; удаление без домена браузер применит к
  // хосту приложения, кука уцелеет — и человек вернётся вошедшим.
  it("стирает куку сессии и её чанки с доменом, чужих не трогает", async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = ".abkhaz-auto.ru";
    vi.resetModules();
    const { logoutAction: fresh } = await import("./auth-actions");
    await fresh().catch(() => {});
    const cleared = mocks.jar.set.mock.calls.map(c => c[0]);
    expect(cleared).toEqual([AUTH_COOKIE_NAME, `${AUTH_COOKIE_NAME}.0`]);
    for (const call of mocks.jar.set.mock.calls) {
      expect(call[1]).toBe("");
      expect(call[2]).toMatchObject({ domain: ".abkhaz-auto.ru", secure: true, path: "/", maxAge: 0 });
    }
  });

  // Стёртой куки мало: натив держит те же токены и вернёт их мостом через
  // секунды. Сессию гасит GoTrue — и только эту, а не все телефоны сервиса.
  it("гасит в GoTrue именно эту сессию", async () => {
    await logout();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  // Отметка на подъёмнике снимается так же, как на «ушёл со смены»: через
  // clearPostMarks, который бережёт принятые машины. Удалить куку целиком
  // значило бы стереть человеку его же работы за день.
  it("снимает человека с поста и стирает примерку роли, уводит на вход", async () => {
    expect(await logout()).toBe("REDIRECT /vhod");
    expect(mocks.clearPostMarks).toHaveBeenCalledWith({ shop: { id: 7 }, userId: "u1" }, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mocks.jar.delete).toHaveBeenCalledWith(VIEW_COOKIE);
  });

  // Витрины у человека может не быть вовсе (экран «Организации нет») — выход
  // оттуда обязан работать, а снимать с поста там некого.
  it("без витрины выход всё равно проходит", async () => {
    mocks.serviceContext.mockResolvedValue(null);
    expect(await logout()).toBe("REDIRECT /vhod");
    expect(mocks.clearPostMarks).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalled();
  });

  // Человек просил выйти — он выйдет. Живая сессия на сервере хуже, чем
  // человек, которого приложение отказалось выпустить.
  it("отказ GoTrue выход не отменяет", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signOut.mockResolvedValue({ error: { message: "gotrue down" } });
    expect(await logout()).toBe("REDIRECT /vhod");
    expect(mocks.jar.set).toHaveBeenCalledWith(AUTH_COOKIE_NAME, "", expect.objectContaining({ maxAge: 0 }));
  });
});
