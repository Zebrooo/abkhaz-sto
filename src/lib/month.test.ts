import { describe, expect, it } from "vitest";
import { addMonths, monthGrid, monthOf, monthTitle, safeMonth } from "@/lib/month";

describe("месяц строкой", () => {
  it("месяц дня и его заголовок", () => {
    expect(monthOf("2026-09-21")).toBe("2026-09");
    expect(monthTitle("2026-09")).toBe("Сентябрь 2026");
    expect(monthTitle("2026-01")).toBe("Январь 2026");
  });

  it("сдвиг месяцев переходит через год", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-09", 3)).toBe("2026-12");
  });

  it("мусор из адреса не ломает календарь", () => {
    expect(safeMonth("2026-13", "2026-09-21")).toBe("2026-09");
    expect(safeMonth("", "2026-09-21")).toBe("2026-09");
    expect(safeMonth(undefined, "2026-09-21")).toBe("2026-09");
    expect(safeMonth("2026-10", "2026-09-21")).toBe("2026-10");
  });
});

describe("monthGrid", () => {
  it("шесть недель по семь дней, начиная с понедельника", () => {
    const grid = monthGrid("2026-09");
    expect(grid).toHaveLength(42);
    // 1 сентября 2026 — вторник, значит первая клетка — понедельник 31 августа.
    expect(grid[0]).toEqual({ day: "2026-08-31", inMonth: false });
    expect(grid[1]).toEqual({ day: "2026-09-01", inMonth: true });
    expect(grid[30]).toEqual({ day: "2026-09-30", inMonth: true });
    expect(grid[31].inMonth).toBe(false);
  });

  it("месяц, начинающийся с понедельника, не съезжает на неделю назад", () => {
    // 1 июня 2026 — понедельник.
    expect(monthGrid("2026-06")[0]).toEqual({ day: "2026-06-01", inMonth: true });
  });

  it("февраль високосного года целиком внутри сетки", () => {
    const grid = monthGrid("2028-02");
    expect(grid.filter(c => c.inMonth)).toHaveLength(29);
  });
});
