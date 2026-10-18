import { describe, expect, it } from "vitest";
import { matchItem, reservePill, stockPill, visibilityLine } from "@/lib/goods/items";
import { ITEM_HIDDEN, ITEM_LAPTOP, ITEM_NO_STOCK, ITEM_PHONE_LOW, ITEM_TODAY } from "@/lib/goods/fixtures";

describe("пилюля остатка — как на артборде", () => {
  it("штуки: доступно, кончается, ноль со скрытием", () => {
    expect(stockPill(ITEM_LAPTOP)).toEqual({ text: "2 шт", tone: "ok" });
    expect(stockPill(ITEM_PHONE_LOW)).toEqual({ text: "1 шт · кончается", tone: "dng" });
    expect(stockPill(ITEM_HIDDEN)).toEqual({ text: "0 шт · скрыт с витрины", tone: "neu" });
    // Ноль, но объявление снято не остатком (владельцем) — про витрину не врём.
    expect(stockPill({ ...ITEM_HIDDEN, visibility: "hidden_owner" })).toEqual({ text: "0 шт", tone: "neu" });
  });

  it("цветы: «есть сегодня» и «под заказ»; без строки — «остаток не ведётся»", () => {
    expect(stockPill(ITEM_TODAY)).toEqual({ text: "есть сегодня", tone: "ok" });
    expect(stockPill({ ...ITEM_TODAY, stock: { ...ITEM_TODAY.stock!, mode: "on_order" } })).toEqual({ text: "под заказ", tone: "neu" });
    expect(stockPill(ITEM_NO_STOCK)).toEqual({ text: "остаток не ведётся", tone: "neu" });
  });

  it("резерв — только когда он есть", () => {
    expect(reservePill(ITEM_LAPTOP)).toEqual({ text: "1 в резерве", tone: "neu" });
    expect(reservePill(ITEM_PHONE_LOW)).toBeNull();
    expect(reservePill(ITEM_NO_STOCK)).toBeNull();
  });

  it("видимость объясняет, вернётся ли товар сам", () => {
    expect(visibilityLine(ITEM_HIDDEN)).toMatch(/вернётся сам/);
    expect(visibilityLine({ ...ITEM_HIDDEN, visibility: "hidden_owner" })).toMatch(/кабинете сайта/);
    expect(visibilityLine({ ...ITEM_HIDDEN, visibility: "hidden_moderation" })).toMatch(/поддержка/);
  });

  it("поиск по названию, описанию и разделу", () => {
    expect(matchItem(ITEM_LAPTOP, "lenovo")).toBe(true);
    expect(matchItem(ITEM_LAPTOP, "ryzen")).toBe(true);
    expect(matchItem(ITEM_LAPTOP, "ноутбуки")).toBe(true);
    expect(matchItem(ITEM_LAPTOP, "iphone")).toBe(false);
    expect(matchItem(ITEM_LAPTOP, " ")).toBe(true);
  });
});
