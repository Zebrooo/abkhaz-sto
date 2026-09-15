import { describe, expect, it } from "vitest";
import { dayStats, dayWindow, freeGaps, isLive, postsNow } from "@/lib/stats";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { localHHMM, localTime } from "@/lib/sto/slots";

const SCHEDULE: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    tue: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    wed: [], thu: [], fri: [], sat: [{ from: "10:00", to: "15:00" }], sun: [],
  },
  posts: 3,
  stepMin: 30,
  bufferMin: 0,
  daysOff: ["2026-09-16"],
};

// 2026-09-15 — вторник; 2026-09-16 — среда и разовый выходной.
const DAY = "2026-09-15";

function row(o: Partial<StoBookingRow> & { from: string; to: string; post: number }): StoBookingRow {
  return {
    id: 1, shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
    service: { title: "Услуга", price: 1000, currency: "RUB", durationMin: 60 },
    starts_at: localTime(DAY, o.from).toISOString(),
    ends_at: localTime(DAY, o.to).toISOString(),
    post_no: o.post, status: "confirmed", cancelled_by: null, source: "site",
    prepay_amount: 0, prepay_status: "none", data: {},
    created_at: localTime(DAY, "08:00").toISOString(), updated_at: localTime(DAY, "08:00").toISOString(),
    ...o,
  } as StoBookingRow;
}

describe("рабочее окно дня", () => {
  it("берёт края всех интервалов, а обед считает нерабочим", () => {
    const w = dayWindow(SCHEDULE, DAY);
    expect(w.fromMin).toBe(9 * 60);
    expect(w.toMin).toBe(18 * 60);
    expect(w.workMin).toBe(8 * 60); // 4 + 4 часа, час обеда не в счёт
    expect(w.off).toBe(false);
  });

  it("разовый выходной и день без часов — закрыто, но сетка не схлопывается", () => {
    for (const day of ["2026-09-16", "2026-09-17"]) {
      const w = dayWindow(SCHEDULE, day);
      expect(w.off).toBe(true);
      expect(w.workMin).toBe(0);
      expect(w.toMin - w.fromMin).toBeGreaterThan(0);
    }
  });

  it("без расписания — тоже не схлопывается", () => {
    expect(dayWindow(null, DAY).off).toBe(true);
  });
});

describe("живая запись", () => {
  it("новая, подтверждённая и выполненная считаются, отменённая и неявка — нет", () => {
    expect(isLive(row({ from: "09:00", to: "10:00", post: 1, status: "new" }))).toBe(true);
    expect(isLive(row({ from: "09:00", to: "10:00", post: 1, status: "confirmed" }))).toBe(true);
    expect(isLive(row({ from: "09:00", to: "10:00", post: 1, status: "done" }))).toBe(true);
    expect(isLive(row({ from: "09:00", to: "10:00", post: 1, status: "cancelled" }))).toBe(false);
    expect(isLive(row({ from: "09:00", to: "10:00", post: 1, status: "no_show" }))).toBe(false);
  });
});

describe("сводка дня", () => {
  const rows = [
    row({ id: 1, from: "09:00", to: "10:00", post: 1, status: "done", service: { title: "А", price: 1500, currency: "RUB", durationMin: 60 } }),
    row({ id: 2, from: "11:00", to: "12:30", post: 1, status: "confirmed", service: { title: "Б", price: 2500, currency: "RUB", durationMin: 90 } }),
    row({ id: 3, from: "15:00", to: "16:00", post: 2, status: "new", service: { title: "В", price: 1200, currency: "RUB", durationMin: 60 } }),
    row({ id: 4, from: "16:00", to: "17:00", post: 2, status: "cancelled", service: { title: "Г", price: 9999, currency: "RUB", durationMin: 60 } }),
  ];

  it("считает только живые записи и их деньги", () => {
    const s = dayStats({ rows, schedule: SCHEDULE, day: DAY, posts: 3 });
    expect(s.count).toBe(3);
    expect(s.revenue).toBe(1500 + 2500 + 1200);
    expect(s.average).toBe(Math.round(5200 / 3));
    expect(s.pending).toBe(1);
  });

  it("окна считает по шагу сетки и числу постов", () => {
    const s = dayStats({ rows, schedule: SCHEDULE, day: DAY, posts: 3 });
    // 8 рабочих часов × 3 поста при шаге 30 минут — 48 окон.
    expect(s.totalSlots).toBe(48);
    // 60 + 90 + 60 минут по шагу 30 — 2 + 3 + 2 окна.
    expect(s.busySlots).toBe(7);
    expect(s.loadPct).toBe(Math.round((7 / 48) * 100));
  });

  it("без расписания загрузка не делится на ноль", () => {
    const s = dayStats({ rows, schedule: null, day: DAY, posts: 1 });
    expect(s.totalSlots).toBe(0);
    expect(s.loadPct).toBe(0);
  });

  it("цена «договорная» не ломает деньги", () => {
    const s = dayStats({ rows: [row({ from: "09:00", to: "10:00", post: 1, service: { title: "А", price: null, currency: "RUB", durationMin: 60 } })], schedule: SCHEDULE, day: DAY, posts: 1 });
    expect(s.revenue).toBe(0);
    expect(s.average).toBe(0);
  });
});

describe("что сейчас на постах", () => {
  const rows = [
    row({ id: 1, from: "11:00", to: "12:30", post: 1 }),
    row({ id: 2, from: "16:00", to: "17:00", post: 2 }),
  ];
  const now = localTime(DAY, "11:30");
  const dayEnd = localTime(DAY, "18:00");

  it("занятый пост показывает запись и когда освободится", () => {
    const [p1] = postsNow({ rows, posts: 2, now, dayEnd, hhmm: localHHMM });
    expect(p1.busy).toBe(true);
    expect(p1.bookingId).toBe(1);
    expect(p1.till).toBe("до 12:30");
  });

  it("свободный пост показывает длину окна до следующей записи", () => {
    const [, p2] = postsNow({ rows, posts: 2, now, dayEnd, hhmm: localHHMM });
    expect(p2.busy).toBe(false);
    expect(p2.bookingId).toBeNull();
    expect(p2.line).toBe("окно 4 ч 30 мин до 16:00");
  });

  it("пост без записей свободен до конца смены", () => {
    const list = postsNow({ rows: [], posts: 1, now, dayEnd, hhmm: localHHMM });
    expect(list[0].line).toBe("окно 6 ч 30 мин до 18:00");
  });
});

describe("свободные куски поста на сетке", () => {
  const work = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }];

  it("обед не становится свободным окном", () => {
    const gaps = freeGaps(work, [{ from: 9 * 60, to: 13 * 60 }, { from: 14 * 60, to: 18 * 60 }]);
    expect(gaps).toEqual([]);
  });

  it("делит интервал по записям и не предлагает куски короче 45 минут", () => {
    const gaps = freeGaps([{ from: "09:00", to: "13:00" }], [
      { from: 9 * 60 + 30, to: 10 * 60 },      // до неё всего 30 минут — не окно
      { from: 11 * 60, to: 12 * 60 },          // между 10:00 и 11:00 — час, окно
    ]);
    expect(gaps).toEqual([{ fromMin: 10 * 60, toMin: 11 * 60 }, { fromMin: 12 * 60, toMin: 13 * 60 }]);
  });

  it("пустой день — по окну на каждый интервал приёма", () => {
    expect(freeGaps(work, [])).toEqual([
      { fromMin: 9 * 60, toMin: 13 * 60 },
      { fromMin: 14 * 60, toMin: 18 * 60 },
    ]);
  });

  it("запись, вылезшая за часы приёма, не рвёт расчёт", () => {
    expect(freeGaps([{ from: "09:00", to: "13:00" }], [{ from: 8 * 60, to: 12 * 60 }]))
      .toEqual([{ fromMin: 12 * 60, toMin: 13 * 60 }]);
  });

  it("выходной — окон нет", () => {
    expect(freeGaps([], [])).toEqual([]);
  });
});
