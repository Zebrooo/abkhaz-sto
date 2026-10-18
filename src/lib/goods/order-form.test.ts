import { describe, expect, it } from "vitest";
import { formEcho, parseItemsParam, parseOrderForm, parseSerials, serializeItemsParam, withQty } from "@/lib/goods/order-form";

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const BASE = { items: "5001:1", name: "Мадина Хагба", phone: "8 940 111-22-33", method: "pickup" };

describe("позиции в адресе", () => {
  it("разбор и обратно; мусор пропускается, повтор — последняя запись", () => {
    expect(parseItemsParam("7701:1,7702:2,7701:3,x:1,5:0,6")).toEqual([{ listingId: 7702, qty: 2 }, { listingId: 7701, qty: 3 }, { listingId: 6, qty: 1 }]);
    expect(serializeItemsParam([{ listingId: 7702, qty: 2 }, { listingId: 7701, qty: 3 }])).toBe("7702:2,7701:3");
    expect(parseItemsParam("")).toEqual([]);
  });

  it("степпер: добавить, убавить до нуля — убрать, потолок — остаток", () => {
    expect(withQty([], 5, 1)).toEqual([{ listingId: 5, qty: 1 }]);
    expect(withQty([{ listingId: 5, qty: 1 }], 5, -1)).toEqual([]);
    expect(withQty([{ listingId: 5, qty: 2 }], 5, 1, 2)).toEqual([{ listingId: 5, qty: 2 }]);
    expect(withQty([{ listingId: 5, qty: 2 }], 7, 1)).toEqual([{ listingId: 5, qty: 2 }, { listingId: 7, qty: 1 }]);
  });
});

describe("разбор формы заказа по звонку", () => {
  it("минимум — товары, имя, телефон, способ", () => {
    expect(parseOrderForm(fd(BASE))).toEqual({
      ok: true,
      input: { items: [{ listingId: 5001, qty: 1 }], buyer: { name: "Мадина Хагба", phone: "+79401112233" }, method: "pickup" },
    });
  });

  it("полный цветочный заказ курьером", () => {
    const res = parseOrderForm(fd({
      ...BASE, method: "courier", address: "ул. Лакоба 24", deliveryPrice: "300", deliveryDate: "2026-10-19", windowFrom: "10:00", windowTo: "12:00",
      payment: "transfer", recipientName: "Мама", recipientPhone: "+7 940 999-00-11", card: "С днём рождения", composition: "15 пионов", note: "позвонить", accept: "1",
    }));
    expect(res).toEqual({
      ok: true,
      input: {
        items: [{ listingId: 5001, qty: 1 }], buyer: { name: "Мадина Хагба", phone: "+79401112233" }, method: "courier",
        address: "ул. Лакоба 24", deliveryPrice: 300, deliveryDate: "2026-10-19", window: { from: "10:00", to: "12:00" },
        payment: "transfer", recipient: { name: "Мама", phone: "+79409990011" }, card: "С днём рождения", composition: "15 пионов", note: "позвонить", accept: true,
      },
    });
  });

  it("электроника: самовывоз ко времени и резерв", () => {
    const res = parseOrderForm(fd({ ...BASE, pickupAt: "2026-10-20T18:30", reserveDays: "2" }));
    expect(res).toMatchObject({ ok: true, input: { pickupAt: "2026-10-20T15:30:00.000Z", reserveDays: 2 } });
  });

  it("отказы — одной строкой для Flash", () => {
    expect(parseOrderForm(fd({ ...BASE, items: "" }))).toEqual({ ok: false, error: "Выберите хотя бы один товар" });
    expect(parseOrderForm(fd({ ...BASE, name: " " }))).toEqual({ ok: false, error: "Укажите имя клиента" });
    expect(parseOrderForm(fd({ ...BASE, phone: "12" }))).toEqual({ ok: false, error: "Телефон не разобран — укажите в формате +7…" });
    expect(parseOrderForm(fd({ ...BASE, method: "drone" }))).toEqual({ ok: false, error: "Выберите доставку или самовывоз" });
    expect(parseOrderForm(fd({ ...BASE, method: "courier" }))).toEqual({ ok: false, error: "Укажите адрес доставки" });
    expect(parseOrderForm(fd({ ...BASE, windowFrom: "10:00", windowTo: "12:00" }))).toEqual({ ok: false, error: "Окно доставки — только вместе с датой" });
    expect(parseOrderForm(fd({ ...BASE, deliveryDate: "2026-10-19", windowFrom: "12:00", windowTo: "10:00" }))).toEqual({ ok: false, error: "Окно доставки: начало должно быть раньше конца" });
    expect(parseOrderForm(fd({ ...BASE, deliveryPrice: "abc" }))).toEqual({ ok: false, error: "Стоимость доставки — число от 0 до 100 000" });
    expect(parseOrderForm(fd({ ...BASE, reserveDays: "30" }))).toEqual({ ok: false, error: "Резерв — от 1 до 14 дней" });
    expect(parseOrderForm(fd({ ...BASE, payment: "online" }))).toEqual({ ok: false, error: "Способ оплаты — при получении, перевод или ссылка" });
  });

  it("серийники по позициям и эхо полей", () => {
    expect(parseSerials(fd({ serial_7701: " SN-001 ", serial_7702: "" }), [{ listingId: 7701 }, { listingId: 7702 }])).toEqual([{ listingId: 7701, serial: "SN-001" }]);
    expect(formEcho(fd({ name: "Мадина", phone: "", card: "привет", items: "1:1" }))).toEqual({ name: "Мадина", card: "привет" });
  });
});
