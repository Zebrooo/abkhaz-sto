import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ownerFilter } from "@/lib/shop-owner";

// Условие «витрина принадлежит человеку» для PostgREST: по user_id ИЛИ по
// телефону учётки. 16.09.2026 на проде и тесте: profiles.phone лежит БЕЗ
// плюса («79…», 28 147 строк), shops.phone — E.164 с плюсом («+7…»). Сырой
// номер профиля в фильтре не совпадал никогда, и ветка «по телефону» была
// мёртвой: владелец без user_id (анкету заполняют без входа на сайт)
// упирался в «сервис не найден».

describe("фильтр владельца витрины", () => {
  it("номер учётки без плюса совпадает с витриной +7…", () => {
    expect(ownerFilter("u1", "79407741771")).toBe("user_id.eq.u1,phone.eq.+79407741771");
  });

  it("ведущая восьмёрка и разделители — та же витрина", () => {
    expect(ownerFilter("u1", "8 (940) 774-17-71")).toBe("user_id.eq.u1,phone.eq.+79407741771");
  });

  it("пустой телефон не считается — только по user_id", () => {
    expect(ownerFilter("u1", null)).toBe("user_id.eq.u1");
    expect(ownerFilter("u1", "")).toBe("user_id.eq.u1");
    expect(ownerFilter("u1", "  ")).toBe("user_id.eq.u1");
  });

  it("кривой номер в фильтр не попадает — только по user_id", () => {
    // Короткий номер normalizePhone пропустит («+1234567»), E.164 — нет.
    expect(ownerFilter("u1", "1234567")).toBe("user_id.eq.u1");
    expect(ownerFilter("u1", "abc")).toBe("user_id.eq.u1");
  });

  it("чужое условие через запятую в фильтр не пролезает", () => {
    // Запятая в or() у PostgREST разделяет условия: непроверенный номер из
    // профиля позволил бы дописать своё и вытащить чужие витрины.
    for (const hostile of ["+7,user_id.neq.u1", "+79407741771,user_id.neq.u1", "phone.eq.+79407741771)"]) {
      expect(ownerFilter("u1", hostile)).toMatch(/^user_id\.eq\.u1(,phone\.eq\.\+\d{11,15})?$/);
    }
  });
});

// Зеркало shop.ts, как services-status.test.ts: фильтр владельца обязан
// собираться через ownerFilter, а не вручную — сырой profiles.phone в or()
// не совпадает с витриной и открывает дописывание условий через запятую.
describe("shop.ts", () => {
  const source = readFileSync(resolve("src/lib/shop.ts"), "utf8");

  it("собирает фильтр владельца только через ownerFilter", () => {
    expect(source).toMatch(/ownerFilter\(/);
    expect(source).not.toMatch(/phone\.eq\./);
  });
});
