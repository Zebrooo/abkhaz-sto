import { describe, expect, it } from "vitest";
import type { ReportBrief } from "@/lib/api/reports";
import { countByStatus, groupByDay, isReportPeriod, periodRange, REPORT_PERIODS } from "@/lib/reports";

/** Потолок периода на стороне сайта — MAX_STO_PERIOD_DAYS в abkhaz-auto. */
const SITE_MAX_DAYS = 62;

const brief = (inspectedAt: string, over: Partial<ReportBrief> = {}): ReportBrief => ({
  inspectionId: 1, bookingId: 812, no: "Д-812", status: "draft", car: "Nissan X-Trail",
  total: 0, masterName: "Леван", inspectedAt, ...over,
});

describe("отчёты за период", () => {
  it("день — только сегодняшний, окно кончается завтрашней полуночью", () => {
    const r = periodRange("day", "2026-09-16");
    expect(r.fromDay).toBe("2026-09-16");
    expect(r.toDay).toBe("2026-09-16");
    // Полночь по часам сервиса (+03:00) — это 21:00 предыдущего дня UTC.
    expect(r.from).toBe("2026-09-15T21:00:00.000Z");
    expect(r.to).toBe("2026-09-16T21:00:00.000Z");
  });

  it("неделя и месяц — скользящее окно назад от сегодня", () => {
    expect(periodRange("week", "2026-09-16").fromDay).toBe("2026-09-10");
    expect(periodRange("month", "2026-09-16").fromDay).toBe("2026-08-18");
  });

  // Ловушка: период длиннее потолка сайт отвергает как validation_error, и
  // экран показал бы «сайт не отдаёт отчёты» вместо списка.
  it("ни один период не длиннее потолка сайта", () => {
    for (const p of REPORT_PERIODS) {
      const r = periodRange(p, "2026-09-16");
      const days = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000;
      expect(days, p).toBeGreaterThan(0);
      expect(days, p).toBeLessThanOrEqual(SITE_MAX_DAYS);
    }
  });

  it("месяц через границу года не съезжает", () => {
    expect(periodRange("month", "2026-01-05").fromDay).toBe("2025-12-07");
  });

  it("период из адреса — только известное слово", () => {
    expect(isReportPeriod("week")).toBe(true);
    expect(isReportPeriod("year")).toBe(false);
    expect(isReportPeriod(undefined)).toBe(false);
  });

  // Сайт отдаёт свежие первыми, но экран на это не опирается: строки
  // вперемешку разъехались бы по заголовкам дней молча.
  it("группы по дням — свежие сверху, чужой порядок не ломает разбивку", () => {
    const groups = groupByDay([
      brief("2026-09-15T08:10:00.000Z", { inspectionId: 1 }),
      brief("2026-09-16T09:00:00.000Z", { inspectionId: 2 }),
      brief("2026-09-15T14:30:00.000Z", { inspectionId: 3 }),
    ]);
    expect(groups.map(g => g.day)).toEqual(["2026-09-16", "2026-09-15"]);
    expect(groups[1].items.map(i => i.inspectionId)).toEqual([3, 1]);
  });

  // День считается по часам сервиса: 22:30 UTC — это уже завтрашнее утро в Москве.
  it("день группы — по часам сервиса, а не по UTC", () => {
    expect(groupByDay([brief("2026-09-15T22:30:00.000Z")])[0].day).toBe("2026-09-16");
  });

  it("пустой список — ни одной группы", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("плитки считают состояния, а не деньги", () => {
    const counts = countByStatus([
      brief("2026-09-16T09:00:00.000Z", { status: "with_client" }),
      brief("2026-09-16T10:00:00.000Z", { status: "with_client" }),
      brief("2026-09-16T11:00:00.000Z", { status: "draft" }),
    ]);
    expect(counts).toEqual({ draft: 1, with_admin: 0, with_client: 2 });
  });
});
