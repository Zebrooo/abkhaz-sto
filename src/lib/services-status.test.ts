import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Зеркало фильтра статусов в listServices. Проверяем то, чего не видно
// глазами и что не ловит ни типизация, ни линт: значения статусов обязаны
// существовать в перечислении listing_status базы. PostgREST на чужом
// значении отвечает ОШИБКОЙ на весь запрос («invalid input value for enum»),
// а listServices ошибку гасит и возвращает пустой список — 15.09.2026 из-за
// статуса "hidden", которого в перечислении нет, услуги пропали у ВСЕХ
// витрин разом: пустой прайс и «у витрины нет услуг» в ручной записи.
//
// Источник истины — перечисление в abkhaz-auto (supabase/migrations);
// добавится значение — дописать сюда же.
const LISTING_STATUS = ["draft", "pending", "active", "sold", "archived", "deleted"];

const source = readFileSync(resolve("src/lib/services.ts"), "utf8");

describe("услуги витрины — фильтр статусов", () => {
  it("статусы в запросе существуют в перечислении listing_status", () => {
    const m = source.match(/\.in\(\s*"status"\s*,\s*\[([^\]]*)\]\s*\)/);
    expect(m, "не нашёлся фильтр .in(\"status\", [...]) в listServices").not.toBeNull();
    const used = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const s of used) expect(LISTING_STATUS).toContain(s);
  });

  it("активные услуги в выборку входят", () => {
    const m = source.match(/\.in\(\s*"status"\s*,\s*\[([^\]]*)\]\s*\)/);
    const used = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    expect(used).toContain("active");
  });
});
