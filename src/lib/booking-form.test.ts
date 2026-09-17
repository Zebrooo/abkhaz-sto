import { describe, expect, it } from "vitest";
import { fittingServices, nextStep, pickService } from "@/lib/booking-form";
import type { StoSchedule } from "@/lib/sto/schedule";
import { localTime } from "@/lib/sto/slots";

const DAY = "2026-09-17";
const schedule: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "18:00" }], tue: [{ from: "09:00", to: "18:00" }],
    wed: [{ from: "09:00", to: "18:00" }], thu: [{ from: "09:00", to: "18:00" }],
    fri: [{ from: "09:00", to: "18:00" }], sat: [{ from: "09:00", to: "18:00" }], sun: [],
  },
  posts: 2, stepMin: 30, bufferMin: 0, daysOff: [],
};
// «Сейчас» — накануне: лид-время не съедает окна дня.
const now = new Date(`${DAY}T00:00:00+03:00`);
const services = [
  { listingId: 1, durationMin: 180 },
  { listingId: 2, durationMin: 60 },
  { listingId: 3, durationMin: 30 },
];
const at = (hhmm: string) => localTime(DAY, hhmm);

const pick = (over: Partial<Parameters<typeof pickService>[0]> = {}) => pickService({
  services, chosenId: 0, schedule, startsAt: null, postNo: null, busy: [], now, ...over,
});

describe("pickService", () => {
  it("выбранная человеком услуга важнее любых догадок", () => {
    expect(pick({ chosenId: 3, startsAt: at("10:00") })?.listingId).toBe(3);
  });

  it("без времени в адресе — первая услуга списка", () => {
    expect(pick()?.listingId).toBe(1);
  });

  it("окно с сетки короче первой услуги — берём ту, что влезает", () => {
    // Оба поста заняты с 11:00, в окно 10:00 влезает только часовая и короче.
    const busy = [1, 2].map(postNo => ({ postNo, startsAt: at("11:00"), endsAt: at("13:00") }));
    expect(pick({ startsAt: at("10:00"), busy })?.listingId).toBe(2);
  });

  it("пост из адреса учитывается: на соседнем свободно, а нам нужен этот", () => {
    const busy = [{ postNo: 2, startsAt: at("11:00"), endsAt: at("13:00") }];
    expect(pick({ startsAt: at("10:00"), postNo: 2, busy })?.listingId).toBe(2);
    expect(pick({ startsAt: at("10:00"), postNo: 1, busy })?.listingId).toBe(1);
  });

  it("не влезает ничего — первая услуга, дальше экран скажет, что окно не подходит", () => {
    const busy = [1, 2].map(postNo => ({ postNo, startsAt: at("10:15"), endsAt: at("18:00") }));
    expect(pick({ startsAt: at("10:00"), busy })?.listingId).toBe(1);
  });

  it("услуг нет — выбирать нечего", () => {
    expect(pick({ services: [] })).toBeUndefined();
  });
});

describe("nextStep", () => {
  it("окно уже выбрано — шаг «Когда» пропускаем", () => {
    expect(nextStep(0, true)).toBe(2);
  });

  it("окна нет — идём выбирать его", () => {
    expect(nextStep(0, false)).toBe(1);
  });

  it("дальше третьего шага мастер не уходит", () => {
    expect(nextStep(1, false)).toBe(2);
    expect(nextStep(2, true)).toBe(2);
  });
});

describe("fittingServices", () => {
  const fit = (over: Partial<Parameters<typeof fittingServices>[0]> = {}) => fittingServices({
    services, schedule, startsAt: null, postNo: null, busy: [], now, ...over,
  });
  // Оба поста заняты с 11:00 — в окно 10:00 влезают только часовая и получасовая.
  const busyFrom11 = [1, 2].map(postNo => ({ postNo, startsAt: at("11:00"), endsAt: at("13:00") }));

  it("времени нет — список как есть", () => {
    expect(fit()).toEqual({ list: services, hidden: 0 });
  });

  it("длинные услуги пропадают из списка", () => {
    const res = fit({ startsAt: at("10:00"), busy: busyFrom11 });
    expect(res.list.map(s => s.listingId)).toEqual([2, 3]);
    expect(res.hidden).toBe(1);
  });

  it("выбранная услуга остаётся, даже если не влезает", () => {
    const res = fit({ startsAt: at("10:00"), busy: busyFrom11, keepId: 1 });
    expect(res.list.map(s => s.listingId)).toEqual([1, 2, 3]);
    expect(res.hidden).toBe(0);
  });

  it("окно свободно на весь день — не прячем ничего", () => {
    expect(fit({ startsAt: at("10:00") })).toEqual({ list: services, hidden: 0 });
  });

  it("не влезает ни одна — показываем все, список не пустеет", () => {
    const busy = [1, 2].map(postNo => ({ postNo, startsAt: at("10:15"), endsAt: at("18:00") }));
    expect(fit({ startsAt: at("10:00"), busy })).toEqual({ list: services, hidden: 0 });
  });

  it("порядок списка сохраняется", () => {
    const res = fit({ startsAt: at("10:00"), busy: busyFrom11 });
    expect(res.list).toEqual([services[1], services[2]]);
  });
});
