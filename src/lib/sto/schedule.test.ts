import { describe, expect, it } from "vitest";
import {
  normalizeStoPrepay, normalizeStoSchedule, stoPrepayAmount, validateStoPrepay, validateStoSchedule,
} from "./schedule";

const week = (over: Record<string, { from: string; to: string }[]> = {}) => ({
  days: { mon: [{ from: "09:00", to: "18:00" }], ...over },
  posts: 2,
  stepMin: 30,
  daysOff: [],
});

describe("validateStoSchedule", () => {
  it("принимает обычную неделю с перерывом и сортирует интервалы по началу", () => {
    const v = validateStoSchedule(week({ tue: [{ from: "14:00", to: "18:00" }, { from: "09:00", to: "13:00" }] }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.schedule.days.tue).toEqual([{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }]);
    // Незаполненные дни — выходные, а не ошибка.
    expect(v.schedule.days.sun).toEqual([]);
    expect(v.schedule.posts).toBe(2);
  });

  it("стык «до 13:00» / «с 13:00» — не пересечение, а наложение — ошибка с номерами интервалов", () => {
    expect(validateStoSchedule(week({ mon: [{ from: "09:00", to: "13:00" }, { from: "13:00", to: "18:00" }] })).ok).toBe(true);
    const v = validateStoSchedule(week({ mon: [{ from: "09:00", to: "13:00" }, { from: "12:30", to: "18:00" }] }));
    expect(v).toEqual({ ok: false, error: expect.stringMatching(/Пн: интервал 2 .* пересекается с интервалом 1/) });
  });

  it("формат времени, порядок начала и конца, лишние интервалы", () => {
    expect(validateStoSchedule(week({ mon: [{ from: "9:00", to: "18:00" }] }))).toEqual({ ok: false, error: expect.stringMatching(/ЧЧ:ММ/) });
    expect(validateStoSchedule(week({ mon: [{ from: "18:00", to: "09:00" }] }))).toEqual({ ok: false, error: expect.stringMatching(/раньше конца/) });
    const five = Array.from({ length: 5 }, (_, i) => ({ from: `0${i + 1}:00`, to: `0${i + 1}:30` }));
    expect(validateStoSchedule(week({ mon: five }))).toEqual({ ok: false, error: expect.stringMatching(/не больше 4/) });
  });

  it("без единого рабочего дня, с постами вне 1…20 или чужим шагом — отказ", () => {
    expect(validateStoSchedule({ ...week(), days: {} })).toEqual({ ok: false, error: "Нужен хотя бы один рабочий день" });
    expect(validateStoSchedule({ ...week(), posts: 0 })).toEqual({ ok: false, error: expect.stringMatching(/от 1 до 20/) });
    expect(validateStoSchedule({ ...week(), posts: 2.5 })).toEqual({ ok: false, error: expect.stringMatching(/от 1 до 20/) });
    expect(validateStoSchedule({ ...week(), stepMin: 45 })).toEqual({ ok: false, error: expect.stringMatching(/15, 20, 30, 60/) });
  });

  it("шаг по умолчанию — 30 минут; выходные — уникальные ISO-даты по порядку", () => {
    const v = validateStoSchedule({ days: week().days, posts: 1, daysOff: ["2026-12-31", "2026-01-01", "2026-12-31"] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.schedule.stepMin).toBe(30);
    expect(v.schedule.daysOff).toEqual(["2026-01-01", "2026-12-31"]);
    expect(validateStoSchedule({ ...week(), daysOff: ["31.12.2026"] })).toEqual({ ok: false, error: expect.stringMatching(/Выходной 1/) });
    // Несуществующая дата — тоже отказ, а не выходной, который никогда не наступит.
    expect(validateStoSchedule({ ...week(), daysOff: ["2026-02-31"] })).toEqual({ ok: false, error: expect.stringMatching(/Выходной 1/) });
  });

  it("смена до полуночи: конец «24:00» допустим, начало — нет, «24:01» — нет", () => {
    expect(validateStoSchedule(week({ sat: [{ from: "20:00", to: "24:00" }] })).ok).toBe(true);
    expect(validateStoSchedule(week({ sat: [{ from: "24:00", to: "24:00" }] })).ok).toBe(false);
    expect(validateStoSchedule(week({ sat: [{ from: "20:00", to: "24:01" }] })).ok).toBe(false);
  });

  it("normalize: из базы кривая запись — null, а не «как получится»", () => {
    // Неверное расписание опаснее отсутствующего: сервис бы получал записи в закрытый день.
    expect(normalizeStoSchedule({})).toBeNull();
    expect(normalizeStoSchedule(null)).toBeNull();
    expect(normalizeStoSchedule({ days: { mon: [{ from: "09:00", to: "8:00" }] }, posts: 1 })).toBeNull();
    expect(normalizeStoSchedule(week())?.posts).toBe(2);
  });
});

describe("предоплата", () => {
  it("off, fixed и percent с проверкой границ", () => {
    expect(validateStoPrepay({ mode: "off" })).toEqual({ ok: true, prepay: { mode: "off" } });
    expect(validateStoPrepay({ mode: "fixed", amount: 500 })).toEqual({ ok: true, prepay: { mode: "fixed", amount: 500, freeCancelHours: 24 } });
    expect(validateStoPrepay({ mode: "percent", percent: 30, freeCancelHours: 0 })).toEqual({ ok: true, prepay: { mode: "percent", percent: 30, freeCancelHours: 0 } });
    expect(validateStoPrepay({ mode: "fixed", amount: 0 })).toEqual({ ok: false, error: expect.stringMatching(/от 1 до/) });
    expect(validateStoPrepay({ mode: "percent", percent: 101 })).toEqual({ ok: false, error: expect.stringMatching(/от 1 до 100/) });
    expect(validateStoPrepay({ mode: "fixed", amount: 500, freeCancelHours: 500 })).toEqual({ ok: false, error: expect.stringMatching(/от 0 до 168/) });
    expect(validateStoPrepay({ mode: "later" })).toEqual({ ok: false, error: expect.stringMatching(/выключена/) });
  });

  it("normalize: кривая запись из базы — выключено, а не сломанная оплата", () => {
    expect(normalizeStoPrepay(null)).toEqual({ mode: "off" });
    expect(normalizeStoPrepay({ mode: "fixed" })).toEqual({ mode: "off" });
  });

  it("сумма: фиксированная не больше цены, процент округляется вверх до рубля, без цены — 0", () => {
    const rub = (price: number | null) => ({ price, currency: "RUB" });
    expect(stoPrepayAmount({ mode: "fixed", amount: 500, freeCancelHours: 24 }, rub(2500))).toBe(500);
    expect(stoPrepayAmount({ mode: "fixed", amount: 500, freeCancelHours: 24 }, rub(300))).toBe(300);
    expect(stoPrepayAmount({ mode: "percent", percent: 30, freeCancelHours: 24 }, rub(2501))).toBe(751);
    expect(stoPrepayAmount({ mode: "percent", percent: 30, freeCancelHours: 24 }, rub(null))).toBe(0);
    expect(stoPrepayAmount({ mode: "off" }, rub(2500))).toBe(0);
  });

  it("не в рублях предоплаты нет: число из одной валюты не подставляется суммой в другой", () => {
    expect(stoPrepayAmount({ mode: "fixed", amount: 500, freeCancelHours: 24 }, { price: 100, currency: "USD" })).toBe(0);
    expect(stoPrepayAmount({ mode: "percent", percent: 30, freeCancelHours: 24 }, { price: 100, currency: "EUR" })).toBe(0);
  });
});
