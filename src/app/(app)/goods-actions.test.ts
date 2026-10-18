import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serviceContext: vi.fn(),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
  revalidatePath: vi.fn(),
  transitionGoodsOrder: vi.fn(),
  createGoodsOrder: vi.fn(),
  extendGoodsReserve: vi.fn(),
  saveGoodsOrderNote: vi.fn(),
  saveGoodsPrice: vi.fn(),
  saveGoodsStock: vi.fn(),
  saveGoodsClientNote: vi.fn(),
  saveGoodsSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/context", () => ({ serviceContext: mocks.serviceContext }));
vi.mock("@/lib/api/goods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/goods")>()),
  transitionGoodsOrder: mocks.transitionGoodsOrder,
  createGoodsOrder: mocks.createGoodsOrder,
  extendGoodsReserve: mocks.extendGoodsReserve,
  saveGoodsOrderNote: mocks.saveGoodsOrderNote,
  saveGoodsPrice: mocks.saveGoodsPrice,
  saveGoodsStock: mocks.saveGoodsStock,
  saveGoodsClientNote: mocks.saveGoodsClientNote,
  saveGoodsSettings: mocks.saveGoodsSettings,
}));

import { createOrderAction, saveGoodsClientNoteAction, saveItemAction, saveVerticalAction, transitionOrderAction } from "./goods-actions";
import { ORDER_ELECTRONICS, ORDER_FLOWERS, ORDER_PHONE_READY } from "@/lib/goods/fixtures";
import { todayLocal } from "@/lib/format";
import { localTime } from "@/lib/sto/slots";

const GOODS_CTX = { shop: { id: 9, kind: "goods" }, userId: "u1", role: "owner", realRole: "owner" };

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** Действие всегда кончается редиректом — он бросает, как в Next; возвращаем адрес. */
const run = (p: Promise<unknown>) => p.then(() => "no redirect", (e: Error) => e.message.replace(/^REDIRECT /, ""));
const query = (url: string) => new URLSearchParams(url.split("?")[1] ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serviceContext.mockResolvedValue(GOODS_CTX);
  mocks.transitionGoodsOrder.mockResolvedValue({ ok: true, data: { order: ORDER_PHONE_READY, clientMessage: "Заказ № 1 040 выдан" } });
  mocks.createGoodsOrder.mockResolvedValue({ ok: true, data: { ...ORDER_ELECTRONICS, id: 318, number: "318" } });
  mocks.saveGoodsPrice.mockResolvedValue({ ok: true, data: {} });
  mocks.saveGoodsStock.mockResolvedValue({ ok: true, data: {} });
  mocks.saveGoodsClientNote.mockResolvedValue({ ok: true, data: {} });
  mocks.saveGoodsSettings.mockResolvedValue({ ok: true, data: { vertical: "flowers" } });
});

describe("переход заказа", () => {
  it("принять цветы со временем сборки: ЧЧ:ММ → ISO сегодняшнего дня, назад с сообщением для WhatsApp", async () => {
    mocks.transitionGoodsOrder.mockResolvedValue({ ok: true, data: { order: { ...ORDER_FLOWERS, buyer: { ...ORDER_FLOWERS.buyer, hasAccount: false } }, clientMessage: "Заказ № 1 042 принят, соберём к 10:00" } });
    const to = await run(transitionOrderAction(fd({ orderId: "1042", status: "assembling", readyBy: "10:00", return: "/zakazy/1042?do=accept" })));
    expect(mocks.transitionGoodsOrder).toHaveBeenCalledWith({
      shopId: 9, actorUserId: "u1", orderId: 1042, status: "assembling",
      readyBy: localTime(todayLocal(), "10:00").toISOString(),
      courierId: undefined, serials: undefined, paid: undefined, cancelReason: undefined,
    });
    expect(to.startsWith("/zakazy/1042?")).toBe(true);
    const q = query(to);
    expect(q.get("do")).toBeNull();
    expect(q.get("ok")).toBe("Заказ принят — напишите клиенту в WhatsApp");
    expect(q.get("msg")).toBe("Заказ № 1 042 принят, соберём к 10:00");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/zakazy/1042");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/magazin");
  });

  it("выдать электронику: серийники по позициям и отметка оплаты", async () => {
    mocks.transitionGoodsOrder.mockResolvedValue({ ok: true, data: { order: ORDER_ELECTRONICS, clientMessage: "Спасибо за покупку!" } });
    const to = await run(transitionOrderAction(fd({ orderId: "318", status: "delivered", serial_7701: " SN-001 ", serial_7702: "", paid: "1", return: "/zakazy/318?do=deliver" })));
    expect(mocks.transitionGoodsOrder).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 318, status: "delivered", serials: [{ listingId: 7701, serial: "SN-001" }], paid: true,
    }));
    const q = query(to);
    // Покупатель с учёткой — его предупредил сайт.
    expect(q.get("ok")).toBe("Заказ закрыт, оплата отмечена — клиент получил уведомление сайта");
    expect(q.get("msg")).toBe("Спасибо за покупку!");
  });

  it("отказ сайта: назад с текстом сайта, шторка остаётся открытой", async () => {
    mocks.transitionGoodsOrder.mockResolvedValue({ ok: false, code: "conflict", error: "Так поменять статус нельзя" });
    const to = await run(transitionOrderAction(fd({ orderId: "318", status: "delivered", return: "/zakazy/318?do=deliver" })));
    const q = query(to);
    expect(q.get("do")).toBe("deliver");
    expect(q.get("err")).toBe("Так поменять статус нельзя");
    expect(q.get("ok")).toBeNull();
  });

  it("курьеру со своим курьером и отказ с причиной", async () => {
    mocks.transitionGoodsOrder.mockResolvedValue({ ok: true, data: { order: ORDER_PHONE_READY, clientMessage: null } });
    await run(transitionOrderAction(fd({ orderId: "1041", status: "shipping", courierId: "c1", return: "/zakazy/1041" })));
    expect(mocks.transitionGoodsOrder).toHaveBeenCalledWith(expect.objectContaining({ status: "shipping", courierId: "c1" }));
    const to = await run(transitionOrderAction(fd({ orderId: "1041", status: "cancelled", cancelReason: "Передумал", return: "/zakazy/1041?do=cancel" })));
    expect(mocks.transitionGoodsOrder).toHaveBeenLastCalledWith(expect.objectContaining({ status: "cancelled", cancelReason: "Передумал" }));
    expect(query(to).get("ok")).toBe("Заказ отменён");
    expect(query(to).get("msg")).toBeNull();
  });

  it("мастер — отказ без похода на сайт; сервисная витрина — на экран сервиса", async () => {
    mocks.serviceContext.mockResolvedValue({ ...GOODS_CTX, role: "master" });
    const to = await run(transitionOrderAction(fd({ orderId: "318", status: "assembling", return: "/zakazy/318" })));
    expect(query(to).get("err")).toBe("Это может админ или хозяин магазина");
    expect(mocks.transitionGoodsOrder).not.toHaveBeenCalled();
    mocks.serviceContext.mockResolvedValue({ ...GOODS_CTX, shop: { id: 7, kind: "service" } });
    expect(await run(transitionOrderAction(fd({ orderId: "318", status: "assembling" })))).toBe("/svodka");
  });

  it("чужой адрес возврата не принимается, неизвестный статус — отказ", async () => {
    const to = await run(transitionOrderAction(fd({ orderId: "318", status: "paid", return: "https://evil.example" })));
    expect(to.startsWith("/zakazy/318")).toBe(true);
    expect(query(to).get("err")).toBe("Неизвестный переход");
  });
});

describe("заказ по звонку", () => {
  it("валидная форма → карточка нового заказа с итогом", async () => {
    const to = await run(createOrderAction(fd({ items: "7701:1", name: "Астамур", phone: "+79404445566", method: "pickup", accept: "1" })));
    expect(mocks.createGoodsOrder).toHaveBeenCalledWith({
      shopId: 9, actorUserId: "u1", items: [{ listingId: 7701, qty: 1 }], buyer: { name: "Астамур", phone: "+79404445566" }, method: "pickup", accept: true,
    });
    expect(to).toBe(`/zakazy/318?ok=${encodeURIComponent("Заказ № 318 заведён и принят")}`);
  });

  it("форма без позиций — назад на шаг оформления с набранным", async () => {
    const to = await run(createOrderAction(fd({ items: "", name: "Астамур", phone: "+79404445566", method: "courier", address: "Гагра" })));
    const q = query(to);
    expect(to.startsWith("/zakazy/novyi?")).toBe(true);
    expect(q.get("step")).toBe("1");
    expect(q.get("err")).toBe("Выберите хотя бы один товар");
    expect(q.get("name")).toBe("Астамур");
    expect(q.get("address")).toBe("Гагра");
    expect(mocks.createGoodsOrder).not.toHaveBeenCalled();
  });

  it("отказ сайта («осталось 2») — назад с его текстом и позициями", async () => {
    mocks.createGoodsOrder.mockResolvedValue({ ok: false, code: "conflict", error: "Ноутбук Lenovo: осталось 2" });
    const to = await run(createOrderAction(fd({ items: "7701:5", name: "Астамур", phone: "+79404445566", method: "pickup" })));
    const q = query(to);
    expect(q.get("i")).toBe("7701:5");
    expect(q.get("err")).toBe("Ноутбук Lenovo: осталось 2");
  });
});

describe("товар: цена и остаток", () => {
  it("цена не менялась — маршрут цены не зовётся; остаток изменился — зовётся с одним полем", async () => {
    const to = await run(saveItemAction(fd({ listingId: "7701", price: "54990", price0: "54990", mode: "count", mode0: "count", qty: "5", qty0: "3", low: "1", low0: "1", return: "/tovary?edit=7701&mode=count" })));
    expect(mocks.saveGoodsPrice).not.toHaveBeenCalled();
    expect(mocks.saveGoodsStock).toHaveBeenCalledWith({ shopId: 9, actorUserId: "u1", listingId: 7701, qty: 5 });
    expect(to).toBe(`/tovary?ok=${encodeURIComponent("Сохранено")}`);
  });

  it("новая цена и остаток, которого не было: оба маршрута, строка остатка заводится целиком", async () => {
    await run(saveItemAction(fd({ listingId: "5003", price: "3 900", price0: "3500", mode: "today", mode0: "", qty: "0", qty0: "", low: "", low0: "", return: "/tovary?edit=5003" })));
    expect(mocks.saveGoodsPrice).toHaveBeenCalledWith({ shopId: 9, actorUserId: "u1", listingId: 5003, price: 3900 });
    expect(mocks.saveGoodsStock).toHaveBeenCalledWith({ shopId: 9, actorUserId: "u1", listingId: 5003, mode: "today", qty: 0 });
  });

  it("кривая цена — отказ, шторка открыта, сайт не трогаем", async () => {
    const to = await run(saveItemAction(fd({ listingId: "7701", price: "0", price0: "54990", return: "/tovary?edit=7701" })));
    expect(query(to).get("edit")).toBe("7701");
    expect(query(to).get("err")).toMatch(/^Цена/);
    expect(mocks.saveGoodsPrice).not.toHaveBeenCalled();
  });
});

describe("клиент и вертикаль", () => {
  it("заметка с датами — на сайт в E.164, обратно без шторки", async () => {
    const to = await run(saveGoodsClientNoteAction(fd({ phone: "8 940 111-22-33", name: "Мадина", note: "Любит пионы", dates: "19.10 день рождения мамы", return: "/pokupateli?note=%2B79401112233" })));
    expect(mocks.saveGoodsClientNote).toHaveBeenCalledWith({
      shopId: 9, actorUserId: "u1", phone: "+79401112233", name: "Мадина", note: "Любит пионы",
      dates: [{ label: "день рождения мамы", day: "10-19", kind: "holiday" }],
    });
    expect(query(to).get("note")).toBeNull();
    expect(query(to).get("ok")).toBe("Заметка сохранена");
  });

  it("кривая дата — отказ с номером строки, шторка остаётся", async () => {
    const to = await run(saveGoodsClientNoteAction(fd({ phone: "+79401112233", dates: "ерунда", return: "/pokupateli?note=%2B79401112233" })));
    expect(query(to).get("note")).toBe("+79401112233");
    expect(query(to).get("err")).toMatch(/^Строка 1/);
    expect(mocks.saveGoodsClientNote).not.toHaveBeenCalled();
  });

  it("вертикаль — только хозяину; админу отказ до сайта", async () => {
    const to = await run(saveVerticalAction(fd({ vertical: "flowers" })));
    expect(mocks.saveGoodsSettings).toHaveBeenCalledWith({ shopId: 9, actorUserId: "u1", vertical: "flowers" });
    expect(query(to).get("ok")).toBe("Вертикаль магазина: цветы");
    mocks.serviceContext.mockResolvedValue({ ...GOODS_CTX, role: "admin" });
    const denied = await run(saveVerticalAction(fd({ vertical: "flowers" })));
    expect(query(denied).get("err")).toBe("Это может только хозяин магазина");
    expect(mocks.saveGoodsSettings).toHaveBeenCalledTimes(1);
  });
});
