import { describe, expect, it } from "vitest";
import { byServiceFromRows, conversion, deltaLabel, jobsLabel, localDaySummary, periodLabel, shares } from "@/lib/money";
import { dayStats } from "@/lib/stats";
import { localTime } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("подпись периода", () => {
  it("день, неделя, месяц", () => {
    expect(periodLabel("day", "2026-09-15", "2026-09-15")).toBe("15 сентября");
    expect(periodLabel("week", "2026-09-14", "2026-09-20")).toBe("14 – 20 сентября");
    expect(periodLabel("month", "2026-09-01", "2026-09-30")).toBe("сентябрь");
  });

  it("ISO с временем читается по часам сервиса, а не по UTC", () => {
    // Полночь понедельника по Москве — это ещё воскресенье 21:00 UTC.
    expect(periodLabel("week", "2026-09-13T21:00:00Z", "2026-09-20T21:00:00Z")).toBe("14 – 20 сентября");
    expect(periodLabel("day", "2026-09-14T21:00:00Z", "2026-09-15T21:00:00Z")).toBe("15 сентября");
  });

  it("исключающая полночь в to — ещё не следующий день", () => {
    expect(periodLabel("week", "2026-09-14T00:00:00+03:00", "2026-09-21T00:00:00+03:00")).toBe("14 – 20 сентября");
    // А конец дня — уже включающий: 23:59 двадцатого остаётся двадцатым.
    expect(periodLabel("week", "2026-09-14T00:00:00+03:00", "2026-09-20T23:59:59+03:00")).toBe("14 – 20 сентября");
  });

  it("неделя через границу месяца", () => {
    expect(periodLabel("week", "2026-09-28", "2026-10-04")).toBe("28 сентября – 4 октября");
  });
});

describe("дельта", () => {
  it("знак и округление", () => {
    expect(deltaLabel(8)).toBe("+8%");
    expect(deltaLabel(12.4)).toBe("+12%");
    expect(deltaLabel(-3)).toBe("−3%");
    expect(deltaLabel(0.2)).toBe("0%");
  });

  it("сравнивать не с чем — подписи нет, а не «+0%»", () => {
    expect(deltaLabel(null)).toBeNull();
    expect(deltaLabel(Number.NaN)).toBeNull();
  });
});

describe("доли для полос", () => {
  it("лидер — целая полоса, остальные к нему", () => {
    expect(shares([19200, 15400, 9700])).toEqual([1, 15400 / 19200, 9700 / 19200]);
  });

  it("без денег — нули, а не деление на ноль", () => {
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });

  it("отрицательная выручка не рисует полосу назад", () => {
    expect(shares([100, -50])).toEqual([1, 0]);
  });
});

describe("конверсия отчётов", () => {
  it("две из трёх — 67%", () => {
    const c = conversion(3, 2, 6700);
    expect(c.ratio).toBe("2 из 3");
    expect(c.text).toBe("67% одобрено");
    expect(c.k).toBeCloseTo(2 / 3);
    expect(plain(c.money)).toBe("+6 700 ₽");
  });

  it("отчётов не было — говорим об этом, а не «0% одобрено»", () => {
    const c = conversion(0, 0, 0);
    expect(c.text).toBe("отчётов ещё не отправляли");
    expect(c.k).toBe(0);
  });

  it("одобрено больше, чем отправлено — не выше 100%", () => {
    const c = conversion(2, 5, 0);
    expect(c.ratio).toBe("2 из 2");
    expect(c.k).toBe(1);
  });

  it("склонение работ", () => {
    expect(jobsLabel(1)).toBe("1 работа");
    expect(jobsLabel(3)).toBe("3 работы");
    expect(jobsLabel(14)).toBe("14 работ");
  });
});

const DAY = "2026-09-15";

function row(o: Partial<StoBookingRow> & { title: string; price: number | null }): StoBookingRow {
  return {
    id: 1, shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
    service: { title: o.title, price: o.price, currency: "RUB", durationMin: 60 },
    starts_at: localTime(DAY, "10:00").toISOString(),
    ends_at: localTime(DAY, "11:00").toISOString(),
    post_no: 1, status: "confirmed", cancelled_by: null, source: "site",
    prepay_amount: 0, prepay_status: "none", data: {},
    created_at: localTime(DAY, "08:00").toISOString(), updated_at: localTime(DAY, "08:00").toISOString(),
    ...o,
  } as StoBookingRow;
}

describe("услуги по записям дня", () => {
  it("складывает по названию, крупное сверху, отменённые не в счёт", () => {
    const lines = byServiceFromRows([
      row({ title: "Замена масла", price: 1500 }),
      row({ title: "Замена масла", price: 1500, status: "done" }),
      row({ title: "Развал-схождение", price: 2500 }),
      row({ title: "Развал-схождение", price: 9000, status: "cancelled" }),
      row({ title: "Диагностика", price: null }),
    ]);
    expect(lines).toEqual([
      { title: "Замена масла", count: 2, revenue: 3000 },
      { title: "Развал-схождение", count: 1, revenue: 2500 },
      { title: "Диагностика", count: 1, revenue: 0 },
    ]);
  });

  it("запасная сводка дня не выдумывает сравнения и отчётов", () => {
    const rows = [row({ title: "Замена масла", price: 1500 })];
    const s = localDaySummary({ day: DAY, stats: dayStats({ rows, schedule: null, day: DAY, posts: 1 }), rows });
    expect(s.period).toBe("day");
    expect(s.revenue).toBe(1500);
    expect(s.jobs).toBe(1);
    expect(s.deltaPct).toBeNull();
    expect(s.reportsSent).toBe(0);
    expect(s.byMaster).toEqual([]);
    expect(periodLabel(s.period, s.from, s.to)).toBe("15 сентября");
  });
});
