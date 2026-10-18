import { describe, expect, it } from "vitest";
import { parseCouriers } from "@/lib/couriers";

describe("parseCouriers — shops.couriers из кабинета сайта", () => {
  it("берёт только строки с id и именем, телефон — строкой или null", () => {
    expect(parseCouriers([
      { id: "c1", name: " Амра ", phone: "+79400000001" },
      { id: "c2", name: "Без телефона" },
      { name: "без id" },
      { id: "c3", name: "   " },
      "мусор",
      null,
    ])).toEqual([
      { id: "c1", name: "Амра", phone: "+79400000001" },
      { id: "c2", name: "Без телефона", phone: null },
    ]);
  });

  it("не массив — пусто", () => {
    expect(parseCouriers(null)).toEqual([]);
    expect(parseCouriers("x")).toEqual([]);
    expect(parseCouriers({ id: "c1", name: "Амра" })).toEqual([]);
  });
});
