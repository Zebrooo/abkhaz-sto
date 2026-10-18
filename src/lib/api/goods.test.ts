import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ siteGet: vi.fn(), sitePost: vi.fn(), sitePostForm: vi.fn() }));
vi.mock("@/lib/api/site-api", () => ({ siteGet: mocks.siteGet, sitePost: mocks.sitePost, sitePostForm: mocks.sitePostForm }));

import {
  createGoodsItem, createGoodsOrder, extendGoodsReserve, fetchGoodsClients, fetchGoodsItems, fetchGoodsOrder, fetchGoodsOrders,
  fetchGoodsSettings, fetchGoodsToday, isClientView, isGoodsOrderStatus, isGoodsVertical, isItemView, isOrderView, isPhonePayment,
  isStockMode, saveGoodsClientNote, saveGoodsOrderNote, saveGoodsPrice, saveGoodsSettings, saveGoodsStock, transitionGoodsOrder,
  uploadGoodsPhoto,
} from "@/lib/api/goods";

const who = { shopId: 7, actorUserId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.siteGet.mockResolvedValue({ ok: true, data: {} });
  mocks.sitePost.mockResolvedValue({ ok: true, data: {} });
  mocks.sitePostForm.mockResolvedValue({ ok: true, data: { stagedId: 1, url: "u" } });
});

// Контракт docs/sto-api-goods-2026-10-18.md: путь и имена параметров —
// ровно те, что ждёт сайт; опечатка здесь — пустой экран там.
describe("клиентский слой /api/sto/goods/*", () => {
  it("GET-ы: путь и query с shopId и actorUserId", async () => {
    await fetchGoodsToday(who);
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/today", who);
    await fetchGoodsSettings(who);
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/settings", who);
    await fetchGoodsOrders({ ...who, view: "work" });
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/orders", { ...who, view: "work" });
    await fetchGoodsOrder({ ...who, orderId: 1042 });
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/orders/item", { ...who, orderId: 1042 });
    await fetchGoodsItems({ ...who, view: "low", category: "elektronika" });
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/items", { ...who, view: "low", category: "elektronika" });
    await fetchGoodsClients({ ...who, view: "holidays" });
    expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/clients", { ...who, view: "holidays" });
  });

  it("POST-ы: путь и тело как есть", async () => {
    await saveGoodsSettings({ ...who, vertical: "flowers" });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/settings", { ...who, vertical: "flowers" });
    const create = { items: [{ listingId: 7701, qty: 2 }], buyer: { name: "Мадина", phone: "+79401112233" }, method: "courier" as const, address: "ул. Лакоба 24", accept: true };
    await createGoodsOrder({ ...who, ...create });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/orders/create", { ...who, ...create });
    await transitionGoodsOrder({ ...who, orderId: 318, status: "delivered", paid: true, serials: [{ listingId: 7701, serial: "SN1" }] });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/orders/transition", { ...who, orderId: 318, status: "delivered", paid: true, serials: [{ listingId: 7701, serial: "SN1" }] });
    await extendGoodsReserve({ ...who, orderId: 318, days: 3 });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/orders/reserve", { ...who, orderId: 318, days: 3 });
    await saveGoodsOrderNote({ ...who, orderId: 318, note: "позвонить" });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/orders/note", { ...who, orderId: 318, note: "позвонить" });
    await saveGoodsStock({ ...who, listingId: 7701, qty: 5 });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/items/stock", { ...who, listingId: 7701, qty: 5 });
    await saveGoodsPrice({ ...who, listingId: 7701, price: 54990 });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/items/price", { ...who, listingId: 7701, price: 54990 });
    await createGoodsItem({ ...who, title: "Букет «Нежность»", price: 3500, categorySlug: "raznoye", stock: { mode: "today" } });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/items/create", { ...who, title: "Букет «Нежность»", price: 3500, categorySlug: "raznoye", stock: { mode: "today" } });
    await saveGoodsClientNote({ ...who, phone: "+79401112233", note: "Любит пионы", dates: [{ label: "день рождения мамы", day: "10-19", kind: "holiday" }] });
    expect(mocks.sitePost).toHaveBeenLastCalledWith("goods/clients/note", { ...who, phone: "+79401112233", note: "Любит пионы", dates: [{ label: "день рождения мамы", day: "10-19", kind: "holiday" }] });
  });

  it("фото — multipart с shopId, actorUserId и файлом", async () => {
    const file = new File(["x"], "cover.jpg", { type: "image/jpeg" });
    expect(await uploadGoodsPhoto({ ...who, file })).toEqual({ ok: true, data: { stagedId: 1, url: "u" } });
    const [path, form] = mocks.sitePostForm.mock.calls[0] as [string, FormData];
    expect(path).toBe("goods/items/photo");
    expect(form.get("shopId")).toBe("7");
    expect(form.get("actorUserId")).toBe("u1");
    expect(form.get("file")).toBe(file);
  });

  it("отказ сайта отдаётся как есть — экран разбирает код сам", async () => {
    mocks.siteGet.mockResolvedValue({ ok: false, code: "not_found", error: "Раздел выключен" });
    expect(await fetchGoodsToday(who)).toEqual({ ok: false, code: "not_found", error: "Раздел выключен" });
  });

  it("виды и словари распознаются, чужие значения — нет", () => {
    expect(isOrderView("closed")).toBe(true);
    expect(isOrderView("all")).toBe(false);
    expect(isItemView("hidden")).toBe(true);
    expect(isItemView("low ")).toBe(false);
    expect(isClientView("warranty")).toBe(true);
    expect(isClientView("vip")).toBe(false);
    expect(isGoodsVertical("electronics")).toBe(true);
    expect(isGoodsVertical("cars")).toBe(false);
    expect(isStockMode("on_order")).toBe(true);
    expect(isStockMode("count ")).toBe(false);
    expect(isPhonePayment("link")).toBe(true);
    // Онлайн-оплата — только у заказов с витрины: заказу по звонку её не выбрать.
    expect(isPhonePayment("online")).toBe(false);
    expect(isGoodsOrderStatus("shipping")).toBe(true);
    expect(isGoodsOrderStatus("paid")).toBe(false);
  });
});
