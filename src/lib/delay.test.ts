import { describe, expect, it } from "vitest";
import { planDelay } from "./delay";
import type { StoBookingRow, StoBookingStatus } from "@/lib/sto/types";

/** Запись поста в этот тестовый день: только то, что читает planDelay. */
function row(input: { id: number; post?: number; from: string; to: string; status?: StoBookingStatus }): StoBookingRow {
  return {
    id: input.id, shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
    service: { title: "Работа", price: 1000, currency: "RUB", durationMin: 60 },
    starts_at: `2026-09-22T${input.from}:00.000Z`, ends_at: `2026-09-22T${input.to}:00.000Z`,
    post_no: input.post ?? 1, status: input.status ?? "confirmed", cancelled_by: null,
    source: "app", prepay_amount: 0, prepay_status: "none", data: {},
    created_at: "2026-09-22T06:00:00.000Z", updated_at: "2026-09-22T06:00:00.000Z",
  };
}

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

describe("planDelay", () => {
  it("продлевает запись и цепочкой двигает вплотную идущие следом", () => {
    const rows = [
      row({ id: 1, from: "09:00", to: "10:00" }),
      row({ id: 2, from: "10:00", to: "11:00" }),
      row({ id: 3, from: "11:00", to: "11:30" }),
    ];
    const plan = planDelay({ rows, bookingId: 1, minutes: 30 });
    if (!plan.ok) throw new Error(plan.error);
    expect(hhmm(plan.endsAt)).toBe("10:30");
    expect(plan.shifts.map(s => [s.row.id, hhmm(s.newStart), hhmm(s.newEnd), s.shiftMin])).toEqual([
      [2, "10:30", "11:30", 30],
      [3, "11:30", "12:00", 30],
    ]);
  });

  it("зазор поглощает задержку: цепочка кончается на первом достаточном", () => {
    const rows = [
      row({ id: 1, from: "09:00", to: "10:00" }),
      row({ id: 2, from: "10:15", to: "11:00" }), // сдвинется на 15, не на 30
      row({ id: 3, from: "12:00", to: "13:00" }), // зазор в час — не едет
    ];
    const plan = planDelay({ rows, bookingId: 1, minutes: 30 });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.shifts.map(s => [s.row.id, s.shiftMin])).toEqual([[2, 15]]);
  });

  it("чужой пост, отменённые и выполненные не двигаются", () => {
    const rows = [
      row({ id: 1, from: "09:00", to: "10:00" }),
      row({ id: 2, from: "10:00", to: "11:00", post: 2 }),
      row({ id: 3, from: "10:00", to: "11:00", status: "cancelled" }),
      row({ id: 4, from: "10:00", to: "11:00", status: "done" }),
    ];
    const plan = planDelay({ rows, bookingId: 1, minutes: 30 });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.shifts).toEqual([]);
  });

  it("никого следом нет — просто длиннее", () => {
    const plan = planDelay({ rows: [row({ id: 1, from: "09:00", to: "10:00" })], bookingId: 1, minutes: 45 });
    if (!plan.ok) throw new Error(plan.error);
    expect(hhmm(plan.endsAt)).toBe("10:45");
    expect(plan.shifts).toEqual([]);
  });

  it("закрытую запись продлить нельзя", () => {
    const plan = planDelay({ rows: [row({ id: 1, from: "09:00", to: "10:00", status: "done" })], bookingId: 1, minutes: 15 });
    expect(plan.ok).toBe(false);
  });

  it("запись не найдена — отказ", () => {
    expect(planDelay({ rows: [], bookingId: 9, minutes: 15 }).ok).toBe(false);
  });
});
