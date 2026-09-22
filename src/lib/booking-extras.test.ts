import { describe, expect, it } from "vitest";
import { bookingPrice, bookingRevenue, delayedMin, extrasTotal } from "./booking-extras";
import type { StoBookingData, StoBookingService } from "@/lib/sto/types";

const b = (price: number | null, data: StoBookingData = {}) => ({
  service: { title: "Замена масла", price, currency: "RUB", durationMin: 60 } as StoBookingService,
  data,
});

const extra = (price: number | null) => ({ title: "Фильтр", price, currency: "RUB" as const, listingId: null, at: "2026-09-22T10:00:00Z" });

describe("деньги записи с доп. услугами", () => {
  it("без extras — цена услуги", () => {
    expect(bookingRevenue(b(1500))).toBe(1500);
    expect(bookingPrice(b(1500))).toBe(1500);
  });

  it("extras суммируются в выручку и в цену", () => {
    const row = b(1500, { extras: [extra(500), extra(300)] });
    expect(extrasTotal(row)).toBe(800);
    expect(bookingRevenue(row)).toBe(2300);
    expect(bookingPrice(row)).toBe(2300);
  });

  it("всё договорное — цены для показа нет", () => {
    expect(bookingPrice(b(null))).toBeNull();
    expect(bookingPrice(b(null, { extras: [extra(null)] }))).toBeNull();
  });

  it("услуга договорная, но у добавленного цена есть — показываем её", () => {
    expect(bookingPrice(b(null, { extras: [extra(700)] }))).toBe(700);
  });
});

describe("delayedMin", () => {
  it("суммирует продления, без них — ноль", () => {
    expect(delayedMin({ data: {} })).toBe(0);
    expect(delayedMin({ data: { delays: [{ at: "", minutes: 15 }, { at: "", minutes: 30 }] } })).toBe(45);
  });
});
