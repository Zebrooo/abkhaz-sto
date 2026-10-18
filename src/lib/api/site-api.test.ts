import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Подпись тянет приватный пакет — тестам ретрая она не нужна.
vi.mock("@zebrooo/service-ticket", () => ({
  issueServiceTicket: () => "ticket",
  SERVICE_TICKET_HEADER: "x-service-ticket",
}));

import { siteGet, sitePost, sitePostForm } from "@/lib/api/site-api";

/** Ответ сайта с данными — как отдаёт apiOk. */
const okResponse = () => new Response(JSON.stringify({ data: [] }), { status: 200 });

/** fetch, который висит до таймаута: отклоняется только по abort от НАШЕГО таймера. */
const hangingFetch = () =>
  vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));

beforeEach(() => {
  vi.useFakeTimers();
  process.env.NEXT_PUBLIC_SITE_URL = "https://site.example";
  process.env.STO_TICKET_PRIVATE_KEY = "key";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ретрай GET: повторяется только мгновенный сетевой отказ", () => {
  it("свой таймаут НЕ ретраится: сайт жив, но медлен — повтор удвоил бы нагрузку", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const p = siteGet("masters");
    // Читающий таймаут — 3 секунды; после него второй попытки быть не должно.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await p).toEqual({ ok: false, code: "unavailable", error: "Сайт сейчас недоступен" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("мгновенный сетевой отказ ретраится один раз — и вторая попытка спасает запрос", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const p = siteGet("masters");
    // Пауза перед повтором — 300 мс.
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toEqual({ ok: true, data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("отказ сайта (HTTP-ошибка) — это ответ, ретрая нет", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "internal", message: "сломалось" } }), { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await siteGet("masters")).toEqual({ ok: false, code: "internal", error: "сломалось" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ретрай POST: не бывает никогда", () => {
  it("сетевой отказ пишущего вызова не повторяется — транзакция могла пройти", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sitePost("members/invite", {});
    expect(res).toEqual({ ok: false, code: "unavailable", error: "Сайт сейчас недоступен" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("multipart (sitePostForm)", () => {
  it("FormData уходит как есть, content-type не ставим — границу выставит fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { stagedId: 1, url: "u" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("shopId", "7");
    expect(await sitePostForm("goods/items/photo", form)).toEqual({ ok: true, data: { stagedId: 1, url: "u" } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty("content-type");
    expect(init.headers).toHaveProperty("x-service-ticket", "ticket");
  });
});
