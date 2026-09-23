import { describe, expect, it } from "vitest";
import { assessSlot, daySlotOptions, SLOT_WARNING_LABEL } from "@/lib/slot-warnings";
import { localTime, type BusyInterval } from "@/lib/sto/slots";
import type { StoSchedule } from "@/lib/sto/schedule";

const DAY = "2026-09-23"; // среда
const SCHEDULE: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "18:00" }], tue: [{ from: "09:00", to: "18:00" }],
    wed: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    thu: [{ from: "09:00", to: "18:00" }], fri: [{ from: "09:00", to: "18:00" }],
    sat: [], sun: [],
  },
  posts: 2, stepMin: 30, bufferMin: 0, daysOff: [],
};
const busy = (postNo: number, from: string, to: string): BusyInterval =>
  ({ postNo, startsAt: localTime(DAY, from), endsAt: localTime(DAY, to) });
const NOON = localTime(DAY, "12:00");
const assess = (hhmm: string, over: Partial<Parameters<typeof assessSlot>[0]> = {}) => assessSlot({
  schedule: SCHEDULE, startsAt: localTime(DAY, hhmm), durationMin: 60, busy: [], now: NOON, ...over,
});

describe("assessSlot — причины", () => {
  it("свободное окно в будущем — без предупреждений, первый пост", () => {
    expect(assess("15:00")).toMatchObject({ postNo: 1, warnings: [] });
  });

  it("прошедшее время — past, БЕЗ часа форы: через полчаса — не «прошло»", () => {
    expect(assess("11:00").warnings).toContain("past");
    expect(assess("14:30", { now: localTime(DAY, "14:00") }).warnings).toEqual([]);
  });

  it("вне часов приёма: до открытия, через обед, выходной день недели, разовый выходной", () => {
    expect(assess("08:00").warnings).toContain("closed");
    expect(assess("12:30", { durationMin: 90 }).warnings).toContain("closed");
    expect(assessSlot({ schedule: SCHEDULE, startsAt: localTime("2026-09-26", "10:00"), durationMin: 60, busy: [], now: NOON }).warnings).toContain("closed");
    expect(assess("15:00", { schedule: { ...SCHEDULE, daysOff: [DAY] } }).warnings).toContain("closed");
  });

  it("заданный пост занят — taken и виновник в conflicts", () => {
    const b = [busy(1, "15:00", "16:00")];
    const res = assess("15:30", { busy: b, postNo: 1 });
    expect(res.warnings).toContain("taken");
    expect(res.postNo).toBe(1);
    expect(res.conflicts).toEqual([b[0]]);
  });

  it("заданный пост впритык без буфера — buffer, не taken", () => {
    const res = assess("16:00", { busy: [busy(1, "15:00", "16:00")], postNo: 1, schedule: { ...SCHEDULE, bufferMin: 15 } });
    expect(res.warnings).toEqual(["buffer"]);
  });

  it("стык встык без буфера — не пересечение", () => {
    expect(assess("16:00", { busy: [busy(1, "15:00", "16:00")], postNo: 1 }).warnings).toEqual([]);
  });

  it("несколько причин сразу: прошло и занято", () => {
    const w = assess("10:00", { busy: [busy(1, "10:00", "11:00")], postNo: 1 }).warnings;
    expect(w).toContain("past");
    expect(w).toContain("taken");
  });
});

describe("assessSlot — выбор поста без заданного", () => {
  it("первый занят — берёт второй, без предупреждений", () => {
    expect(assess("15:00", { busy: [busy(1, "15:00", "16:00")] })).toMatchObject({ postNo: 2, warnings: [] });
  });

  it("свободного с буфером нет, без буфера есть — этот пост и buffer", () => {
    const res = assess("16:00", {
      busy: [busy(1, "15:00", "16:00"), busy(2, "16:30", "17:30")],
      schedule: { ...SCHEDULE, bufferMin: 15 },
    });
    expect(res).toMatchObject({ postNo: 1, warnings: ["buffer"] });
  });

  it("все посты пересечены — пост с наименьшим числом наложений, при равенстве меньший номер", () => {
    const res = assess("15:00", {
      busy: [busy(1, "14:30", "15:30"), busy(1, "15:30", "16:30"), busy(2, "15:00", "16:00")],
    });
    expect(res.postNo).toBe(2);
    expect(res.warnings).toContain("taken");
    expect(res.conflicts.map(c => c.postNo)).toEqual([2]);
  });
});

describe("daySlotOptions — все узлы сетки дня", () => {
  it("узлы идут по шагу внутри интервалов, свободные — без предупреждений", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts[0]).toMatchObject({ hhmm: "09:00", warnings: [] });
    expect(opts.some(o => o.hhmm === "13:30")).toBe(false); // обед — узлов нет
    expect(opts.at(-1)!.hhmm).toBe("17:30"); // последний узел смены остаётся, хоть услуга и не влезает
  });

  it("хвост смены, куда услуга не влезает, помечен closed, а не спрятан", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts.find(o => o.hhmm === "17:30")!.warnings).toContain("closed");
    expect(opts.find(o => o.hhmm === "17:00")!.warnings).toEqual([]);
  });

  it("занятые и прошедшие узлы получают свои причины", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [busy(1, "15:00", "16:00"), busy(2, "15:00", "16:00")], now: NOON });
    expect(opts.find(o => o.hhmm === "15:00")!.warnings).toContain("taken");
    expect(opts.find(o => o.hhmm === "10:00")!.warnings).toContain("past");
  });

  it("заданный пост сужает оценку до него", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [busy(1, "15:00", "16:00")], now: NOON, postNo: 1 });
    expect(opts.find(o => o.hhmm === "15:00")).toMatchObject({ postNo: 1, warnings: ["taken"] });
  });

  it("разовый выходной — сетка по часам дня недели, все узлы closed", () => {
    const opts = daySlotOptions({ schedule: { ...SCHEDULE, daysOff: [DAY] }, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every(o => o.warnings.includes("closed"))).toBe(true);
  });

  it("день недели без часов приёма — узлов нет", () => {
    expect(daySlotOptions({ schedule: SCHEDULE, day: "2026-09-26", durationMin: 60, busy: [], now: NOON })).toEqual([]);
  });

  it("кривое расписание (шаг 0) — пусто, а не вечный цикл", () => {
    expect(daySlotOptions({ schedule: { ...SCHEDULE, stepMin: 0 }, day: DAY, durationMin: 60, busy: [], now: NOON })).toEqual([]);
  });
});

describe("подписи", () => {
  it("у каждой причины есть человеческий текст", () => {
    for (const w of ["past", "closed", "taken", "buffer"] as const) {
      expect(SLOT_WARNING_LABEL[w].length).toBeGreaterThan(3);
    }
  });
});
