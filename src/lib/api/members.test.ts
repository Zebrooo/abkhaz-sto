import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ siteGet: vi.fn() }));
vi.mock("@/lib/api/site-api", () => ({ siteGet: mocks.siteGet, sitePost: vi.fn() }));

import { fetchMyShops, invalidateMyShops } from "@/lib/api/members";

const membership = { shopId: 7, role: "admin", masterId: null, active: true };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.siteGet.mockReset();
  mocks.siteGet.mockResolvedValue({ ok: true, data: [membership] });
});

afterEach(() => vi.useRealTimers());

// Ключ кэша — userId, поэтому у каждого теста свой: кэш модульный и живёт
// между тестами, как и между запросами в проде.
describe("кэш членств (fetchMyShops)", () => {
  it("попадание: повторный вызов в пределах TTL не ходит на сайт", async () => {
    expect(await fetchMyShops("u-hit")).toEqual({ ok: true, data: [membership] });
    vi.advanceTimersByTime(29_000);
    expect(await fetchMyShops("u-hit")).toEqual({ ok: true, data: [membership] });
    expect(mocks.siteGet).toHaveBeenCalledTimes(1);
  });

  it("протухание: через 30 секунд — снова на сайт", async () => {
    await fetchMyShops("u-ttl");
    vi.advanceTimersByTime(30_000);
    await fetchMyShops("u-ttl");
    expect(mocks.siteGet).toHaveBeenCalledTimes(2);
  });

  it("сброс invalidateMyShops: правка доступов видна сразу, не дожидаясь TTL", async () => {
    await fetchMyShops("u-inv");
    invalidateMyShops("u-inv");
    await fetchMyShops("u-inv");
    expect(mocks.siteGet).toHaveBeenCalledTimes(2);
  });

  it("сброс во время полёта: устаревший ответ в кэш не садится (увольнение — граница чтений базы)", async () => {
    let release!: (v: unknown) => void;
    mocks.siteGet.mockReturnValueOnce(new Promise(r => { release = r; }));
    const inflight = fetchMyShops("u-race");
    // Пока запрос летел, доступы поменяли — его ответ уже устарел.
    invalidateMyShops("u-race");
    release({ ok: true, data: [membership] });
    await inflight;
    await fetchMyShops("u-race");
    expect(mocks.siteGet).toHaveBeenCalledTimes(2);
  });

  it("кэш отдаёт копию: sort() у вызывающего не отравляет кэш процесса", async () => {
    const first = await fetchMyShops("u-copy");
    if (first.ok) first.data.length = 0;
    const second = await fetchMyShops("u-copy");
    expect(second).toEqual({ ok: true, data: [membership] });
    expect(mocks.siteGet).toHaveBeenCalledTimes(1);
  });

  it("ошибка сайта не кэшируется: следующий рендер спрашивает снова", async () => {
    mocks.siteGet.mockResolvedValue({ ok: false, code: "unavailable", error: "Сайт сейчас недоступен" });
    expect((await fetchMyShops("u-err")).ok).toBe(false);
    expect((await fetchMyShops("u-err")).ok).toBe(false);
    expect(mocks.siteGet).toHaveBeenCalledTimes(2);
  });

  it("кэш — по человеку: чужой userId попаданием не считается", async () => {
    await fetchMyShops("u-one");
    await fetchMyShops("u-two");
    expect(mocks.siteGet).toHaveBeenCalledTimes(2);
  });
});
