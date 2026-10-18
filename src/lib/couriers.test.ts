import { describe, expect, it } from "vitest";
import { parseCouriers } from "@/lib/couriers";

describe("parseCouriers — shops.couriers тем же ситом, что схема сайта", () => {
  it("берёт строки с id из 4–24 латинских букв и цифр, именем и телефоном", () => {
    expect(parseCouriers([
      { id: "amra1", name: " Амра ", phone: "+79400000001" },
      { id: "saidsaid", name: "Саид", phone: " +7 940 000-00-02 " },
      { id: "c1", name: "Короткий id — сайт такого не видит", phone: "+79400000003" },
      { id: "amra2", name: "Без телефона" },
      { id: "amra3", name: "Телефон короткий", phone: "123" },
      { name: "без id", phone: "+79400000004" },
      { id: "amra4", name: "   ", phone: "+79400000005" },
      "мусор",
      null,
    ])).toEqual([
      { id: "amra1", name: "Амра", phone: "+79400000001" },
      { id: "saidsaid", name: "Саид", phone: "+7 940 000-00-02" },
    ]);
  });

  it("не массив — пусто", () => {
    expect(parseCouriers(null)).toEqual([]);
    expect(parseCouriers("x")).toEqual([]);
    expect(parseCouriers({ id: "amra1", name: "Амра", phone: "+79400000001" })).toEqual([]);
  });
});
