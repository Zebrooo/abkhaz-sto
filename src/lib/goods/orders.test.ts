import { describe, expect, it } from "vitest";
import {
  actionsFor, canCancel, handoverLabel, handoverWhen, itemsLine, matchOrder, orderPills, orderTitle, slaLabel, statusPill, upcomingTime,
  VIEW_OF_STATUS, whatsappUrl, whenLabel,
} from "@/lib/goods/orders";
import { NOW, ORDER_ASSEMBLING, ORDER_ELECTRONICS, ORDER_FLOWERS, ORDER_PHONE_READY } from "@/lib/goods/fixtures";
import { rub } from "@/lib/format";

describe("главное действие по статусу — только из next сайта", () => {
  it("новый: цветам «Принять» со временем сборки, электронике — сразу", () => {
    expect(actionsFor(ORDER_FLOWERS)).toEqual([{ status: "assembling", label: "Принять", needs: "readyBy" }]);
    expect(actionsFor(ORDER_ELECTRONICS)).toEqual([{ status: "assembling", label: "Принять", needs: "none" }]);
  });

  it("принят, курьером: «Готов» главное, «Курьеру» второе — с выбором курьера", () => {
    expect(actionsFor(ORDER_ASSEMBLING)).toEqual([
      { status: "ready", label: "Готов", needs: "none" },
      { status: "shipping", label: "Курьеру", needs: "courier" },
    ]);
  });

  it("готов, самовывоз, не оплачен: «Выдан и оплачен» одной кнопкой с отметкой оплаты", () => {
    expect(actionsFor(ORDER_PHONE_READY)).toEqual([{ status: "delivered", label: "Выдан и оплачен", needs: "none", paid: true }]);
    expect(actionsFor({ ...ORDER_PHONE_READY, paidAt: "2026-10-18T07:00:00.000Z" })).toEqual([{ status: "delivered", label: "Выдан", needs: "none" }]);
  });

  it("электроника при выдаче идёт через шторку серийников", () => {
    const ready = { ...ORDER_ELECTRONICS, status: "ready" as const, next: ["delivered", "cancelled"] as const };
    expect(actionsFor({ ...ready, next: [...ready.next] })).toEqual([{ status: "delivered", label: "Выдан", needs: "deliver" }]);
    expect(actionsFor({ ...ready, next: [...ready.next], paidAt: null })).toEqual([{ status: "delivered", label: "Выдан и оплачен", needs: "deliver" }]);
  });

  it("у курьера → «Доставлен»; закрытому и отменённому действий нет", () => {
    expect(actionsFor({ ...ORDER_ASSEMBLING, status: "shipping", next: ["delivered", "cancelled"] })).toEqual([{ status: "delivered", label: "Доставлен", needs: "none" }]);
    expect(actionsFor({ ...ORDER_ASSEMBLING, status: "delivered", next: [] })).toEqual([]);
    expect(canCancel({ ...ORDER_ASSEMBLING, status: "delivered", next: [] })).toBe(false);
    expect(canCancel(ORDER_FLOWERS)).toBe(true);
  });

  // Сайт — граница: что бы ни говорил статус, без перехода в next кнопки нет.
  it("next пустой — действий нет, даже у нового", () => {
    expect(actionsFor({ ...ORDER_FLOWERS, next: [] })).toEqual([]);
  });
});

describe("подписи", () => {
  it("статус: новый — с давностью, принят — со временем сборки", () => {
    expect(statusPill(ORDER_FLOWERS, NOW)).toEqual({ text: "новый · 4 минуты назад", tone: "dng" });
    expect(statusPill(ORDER_ASSEMBLING, NOW)).toEqual({ text: "собрать к 10:00", tone: "warn" });
    expect(statusPill(ORDER_PHONE_READY, NOW)).toEqual({ text: "готов", tone: "ok" });
  });

  it("когда: сегодня, завтра, дата", () => {
    expect(whenLabel("2026-10-18T08:00:00.000Z", NOW)).toBe("сегодня 11:00");
    expect(whenLabel("2026-10-19T07:00:00.000Z", NOW)).toBe("завтра 10:00");
    expect(whenLabel("2026-10-25T07:00:00.000Z", NOW)).toBe("25.10 · 10:00");
  });

  it("передача: окно даты точнее dueAt, самовывоз — по времени", () => {
    expect(handoverLabel(ORDER_FLOWERS, NOW)).toBe("доставка · завтра 10:00–12:00");
    expect(handoverLabel(ORDER_PHONE_READY, NOW)).toBe("самовывоз · сегодня 13:30");
    expect(handoverLabel(ORDER_ELECTRONICS, NOW)).toBe("самовывоз");
    expect(handoverWhen(ORDER_ELECTRONICS, NOW)).toBeNull();
    expect(handoverWhen(ORDER_PHONE_READY, NOW)).toBe("сегодня 13:30");
    expect(handoverLabel({ ...ORDER_ELECTRONICS, slot: "20.10 · 12:00–14:00", method: "courier" }, NOW)).toBe("доставка · 20.10 · 12:00–14:00");
  });

  it("пилюли карточки: передача сегодня — янтарная, адрес, открытка, оплата, резерв", () => {
    expect(orderPills(ORDER_ASSEMBLING, NOW)).toEqual([
      { text: "доставка · сегодня 11:00", tone: "warn" },
      { text: "ул. Лакоба 24", tone: "neu" },
      { text: "оплачен", tone: "ok" },
    ]);
    expect(orderPills(ORDER_FLOWERS, NOW)).toEqual([
      { text: "доставка · завтра 10:00–12:00", tone: "neu" },
      { text: "ул. Лакоба 24", tone: "neu" },
      { text: "открытка: «С днём рождения, мама»", tone: "neu" },
      { text: "оплачен", tone: "ok" },
    ]);
    expect(orderPills(ORDER_PHONE_READY, NOW)).toContainEqual({ text: "оплата при получении", tone: "warn" });
    expect(orderPills({ ...ORDER_PHONE_READY, payment: "transfer" }, NOW)).toContainEqual({ text: "оплата переводом", tone: "warn" });
    expect(orderPills(ORDER_ELECTRONICS, NOW)).toContainEqual({ text: "резерв до 20.10 · 20:00", tone: "warn" });
    expect(orderPills({ ...ORDER_ELECTRONICS, reserveExpired: true }, NOW)).toContainEqual({ text: "резерв истёк", tone: "dng" });
    // Закрытому резерв не нужен.
    expect(orderPills({ ...ORDER_ELECTRONICS, status: "delivered" }, NOW).some(p => p.text.startsWith("резерв"))).toBe(false);
  });

  it("название и строка позиций", () => {
    expect(orderTitle(ORDER_FLOWERS)).toBe("Корзина с пионами");
    expect(orderTitle({ ...ORDER_FLOWERS, items: [...ORDER_FLOWERS.items, ...ORDER_ASSEMBLING.items, ...ORDER_PHONE_READY.items] })).toBe("Корзина с пионами + ещё 2 позиции");
    expect(itemsLine(ORDER_PHONE_READY)).toBe(`25 шт · ${rub(6250)} · по телефону`);
    expect(itemsLine(ORDER_FLOWERS)).toBe(`1 шт · ${rub(9200)} · с витрины`);
  });

  it("вид списка по статусу, время в «Ближайших», SLA", () => {
    expect(VIEW_OF_STATUS.shipping).toBe("delivery");
    expect(VIEW_OF_STATUS.cancelled).toBe("closed");
    expect(upcomingTime(ORDER_ASSEMBLING)).toBe("11:00");
    expect(upcomingTime(ORDER_ELECTRONICS)).toBe("—");
    expect(slaLabel(0.25)).toBe("ответить до 15 мин");
    expect(slaLabel(2)).toBe("ответить до 2 ч");
    expect(slaLabel(0)).toBe("ответить как можно скорее");
  });
});

describe("поиск и WhatsApp", () => {
  it("по номеру, телефону, имени, адресу и позиции; пустой запрос — всё", () => {
    expect(matchOrder(ORDER_FLOWERS, "1042")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "1 042")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "111-22")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "мадина")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "лакоба")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "пион")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "")).toBe(true);
    expect(matchOrder(ORDER_FLOWERS, "саид")).toBe(false);
  });

  it("wa.me — цифры и текст в адресе; без телефона — null", () => {
    expect(whatsappUrl("+7 940 111-22-33", "Заказ № 1 042 принят")).toBe("https://wa.me/79401112233?text=%D0%97%D0%B0%D0%BA%D0%B0%D0%B7%20%E2%84%96%201%20042%20%D0%BF%D1%80%D0%B8%D0%BD%D1%8F%D1%82");
    expect(whatsappUrl("+79401112233")).toBe("https://wa.me/79401112233");
    expect(whatsappUrl(null, "текст")).toBeNull();
    expect(whatsappUrl("—")).toBeNull();
  });
});
