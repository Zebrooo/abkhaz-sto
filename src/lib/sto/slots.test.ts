import { describe, expect, it } from "vitest";
import type { StoSchedule } from "./schedule";
import { dayOfWeek, freeSlots, isSlotFree, localDay, localHHMM, localTime } from "./slots";

const schedule: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    tue: [{ from: "09:00", to: "18:00" }], wed: [], thu: [], fri: [], sat: [{ from: "10:00", to: "24:00" }], sun: [],
  },
  posts: 2,
  stepMin: 30,
  daysOff: ["2026-09-22"],
};
// 2026-09-21 — понедельник, 2026-09-22 — вторник, 2026-09-26 — суббота.
const early = new Date("2026-09-20T12:00:00+03:00");
const hhmm = (s: { startsAt: Date }) => localHHMM(s.startsAt);

describe("время по часам сервиса", () => {
  it("«09:00» понедельника — это 06:00 UTC; день недели и обратные функции сходятся", () => {
    expect(localTime("2026-09-21", "09:00").toISOString()).toBe("2026-09-21T06:00:00.000Z");
    expect(dayOfWeek("2026-09-21")).toBe("mon");
    expect(dayOfWeek("2026-09-27")).toBe("sun");
    expect(localDay(localTime("2026-09-21", "00:30"))).toBe("2026-09-21");
    expect(localHHMM(localTime("2026-09-21", "23:45"))).toBe("23:45");
  });
});

describe("freeSlots", () => {
  it("окна по сетке внутри интервалов, услуга через обед не предлагается", () => {
    const slots = freeSlots({ schedule, day: "2026-09-21", durationMin: 60, busy: [], now: early });
    const starts = slots.map(hhmm);
    expect(starts.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
    // Последнее окно первой смены — 12:00 (12:00–13:00); 12:30 не влезает.
    expect(starts).toContain("12:00");
    expect(starts).not.toContain("12:30");
    expect(starts).toContain("14:00");
    expect(starts.at(-1)).toBe("17:00");
    expect(slots.every(s => s.postNo === 1)).toBe(true);
  });

  it("занятый пост уводит на второй, два занятых — окно пропадает", () => {
    const busy = [
      { postNo: 1, startsAt: localTime("2026-09-21", "09:00"), endsAt: localTime("2026-09-21", "10:00") },
      { postNo: 2, startsAt: localTime("2026-09-21", "09:30"), endsAt: localTime("2026-09-21", "10:30") },
    ];
    const slots = freeSlots({ schedule, day: "2026-09-21", durationMin: 60, busy, now: early });
    const at = (t: string) => slots.find(s => hhmm(s) === t);
    // 09:00–10:00: пост 1 занят, пост 2 свободен до 09:30 — нет, занят с 09:30 → пересечение → окна нет.
    expect(at("09:00")).toBeUndefined();
    // 09:30–10:30: пост 1 свободен с 10:00 — нет, занят до 10:00 → пересечение; пост 2 занят → нет.
    expect(at("09:30")).toBeUndefined();
    // 10:00–11:00: пост 1 свободен → пост 1.
    expect(at("10:00")?.postNo).toBe(1);
    // Стык «до 10:00» / «с 10:00» — не пересечение.
    expect(at("10:30")?.postNo).toBe(1);
  });

  it("выходной, закрытый день и прошедшее время — пусто; ближайший час не предлагается", () => {
    expect(freeSlots({ schedule, day: "2026-09-22", durationMin: 60, busy: [], now: early })).toEqual([]);
    expect(freeSlots({ schedule, day: "2026-09-23", durationMin: 60, busy: [], now: early })).toEqual([]);
    const now = new Date("2026-09-21T10:10:00+03:00");
    const starts = freeSlots({ schedule, day: "2026-09-21", durationMin: 60, busy: [], now }).map(hhmm);
    // now + 60 мин = 11:10 → первое окно 11:30.
    expect(starts[0]).toBe("11:30");
  });

  it("смена до «24:00»: последнее окно доходит до полуночи", () => {
    const starts = freeSlots({ schedule, day: "2026-09-26", durationMin: 60, busy: [], now: early }).map(hhmm);
    expect(starts.at(-1)).toBe("23:00");
  });

  it("нулевая или дробная длительность — окон нет, а не бесконечный цикл", () => {
    expect(freeSlots({ schedule, day: "2026-09-21", durationMin: 0, busy: [], now: early })).toEqual([]);
    expect(freeSlots({ schedule, day: "2026-09-21", durationMin: 2.5, busy: [], now: early })).toEqual([]);
  });

  it("шаг 0 или постов 0 в расписании — окон нет, а не вечный цикл", () => {
    expect(freeSlots({ schedule: { ...schedule, stepMin: 0 }, day: "2026-09-21", durationMin: 60, busy: [], now: early })).toEqual([]);
    expect(freeSlots({ schedule: { ...schedule, posts: 0 }, day: "2026-09-21", durationMin: 60, busy: [], now: early })).toEqual([]);
  });

  it("пересекающиеся и неупорядоченные интервалы — окна по времени и без повторов", () => {
    const messy: StoSchedule = { ...schedule, days: { ...schedule.days, mon: [{ from: "11:00", to: "13:00" }, { from: "09:00", to: "12:00" }] } };
    const starts = freeSlots({ schedule: messy, day: "2026-09-21", durationMin: 60, busy: [], now: early }).map(hhmm);
    expect(starts).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"]);
  });
});

describe("isSlotFree", () => {
  it("внутри смены и свободно — ok с первым постом; занято — taken; вне смены или в выходной — closed", () => {
    const busy = [{ postNo: 1, startsAt: localTime("2026-09-21", "09:00"), endsAt: localTime("2026-09-21", "10:00") }];
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "09:00"), durationMin: 60, busy })).toEqual({ ok: true, postNo: 2 });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "09:00"), durationMin: 60, busy, postNo: 1 })).toEqual({ ok: false, reason: "taken" });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "12:30"), durationMin: 60, busy })).toEqual({ ok: false, reason: "closed" });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-22", "10:00"), durationMin: 60, busy })).toEqual({ ok: false, reason: "closed" });
  });

  it("пост, которого у сервиса нет, — no_post; с «сейчас» прошедшее и ближайший час — past", () => {
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:00"), durationMin: 60, busy: [], postNo: 99 })).toEqual({ ok: false, reason: "no_post" });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:00"), durationMin: 60, busy: [], postNo: 0 })).toEqual({ ok: false, reason: "no_post" });
    // Постов в расписании нет — «постов нет», а не «занято» (как freeSlots: пусто).
    expect(isSlotFree({ schedule: { ...schedule, posts: 0 }, startsAt: localTime("2026-09-21", "10:00"), durationMin: 60, busy: [] })).toEqual({ ok: false, reason: "no_post" });
    const now = new Date("2026-09-21T09:30:00+03:00");
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:00"), durationMin: 60, busy: [], now })).toEqual({ ok: false, reason: "past" });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:30"), durationMin: 60, busy: [], now })).toEqual({ ok: true, postNo: 1 });
    // Без «сейчас» прошедшее не отсекается — так переносит задним числом приложение.
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:00"), durationMin: 60, busy: [] })).toEqual({ ok: true, postNo: 1 });
    expect(isSlotFree({ schedule, startsAt: localTime("2026-09-21", "10:00"), durationMin: 0, busy: [] })).toEqual({ ok: false, reason: "closed" });
  });
});
