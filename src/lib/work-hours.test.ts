import { describe, expect, it } from "vitest";
import { workHoursLabel } from "@/lib/work-hours";
import type { StoSchedule } from "@/lib/sto/schedule";

const at = (from: string, to: string) => [{ from, to }];
const week = (over: Partial<StoSchedule["days"]> = {}): StoSchedule => ({
  days: {
    mon: at("09:00", "18:00"), tue: at("09:00", "18:00"), wed: at("09:00", "18:00"),
    thu: at("09:00", "18:00"), fri: at("09:00", "18:00"), sat: at("09:00", "18:00"),
    sun: at("09:00", "18:00"), ...over,
  },
  posts: 2, stepMin: 30, bufferMin: 0, daysOff: [],
});

describe("workHoursLabel", () => {
  it("одни часы всю неделю — «ежедневно»", () => {
    expect(workHoursLabel(week())).toBe("ежедневно 9:00–18:00");
  });

  it("понедельник выходной — диапазон дней и выходной в конце", () => {
    expect(workHoursLabel(week({ mon: [] }))).toBe("вт–вс 9:00–18:00, пн — выходной");
  });

  it("два выходных — «выходные»", () => {
    expect(workHoursLabel(week({ sat: [], sun: [] }))).toBe("пн–пт 9:00–18:00, сб, вс — выходные");
  });

  it("суббота короче — своя группа", () => {
    expect(workHoursLabel(week({ sat: at("10:00", "14:00"), sun: [] })))
      .toBe("пн–пт 9:00–18:00, сб 10:00–14:00, вс — выходной");
  });

  it("перерыв на обед — интервалы через «и»", () => {
    const lunch = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }];
    expect(workHoursLabel(week({ mon: lunch, tue: lunch, wed: lunch, thu: lunch, fri: lunch, sat: lunch, sun: lunch })))
      .toBe("ежедневно 9:00–13:00 и 14:00–18:00");
  });

  it("часов приёма нет вовсе — пустая строка, ручной текст не перетирается", () => {
    expect(workHoursLabel(week({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }))).toBe("");
  });

  it("несмежные дни с одинаковыми часами — две группы, а не склейка", () => {
    expect(workHoursLabel(week({ wed: [] })))
      .toBe("пн–вт 9:00–18:00, чт–вс 9:00–18:00, ср — выходной");
  });
});
