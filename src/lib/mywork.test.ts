import { describe, expect, it } from "vitest";
import { busyMinutes, inspectTarget, jobNow, jobsAfter, masterBookings, minutesLeft } from "@/lib/mywork";
import type { StoBookingRow } from "@/lib/sto/types";
import { localTime } from "@/lib/sto/slots";

const DAY = "2026-09-15";

function row(o: Partial<StoBookingRow> & { id: number; from: string; to: string; post: number }): StoBookingRow {
  return {
    shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
    service: { title: "Услуга", price: 1000, currency: "RUB", durationMin: 60 },
    starts_at: localTime(DAY, o.from).toISOString(),
    ends_at: localTime(DAY, o.to).toISOString(),
    post_no: o.post, status: "confirmed", cancelled_by: null, source: "site",
    prepay_amount: 0, prepay_status: "none", data: {},
    created_at: localTime(DAY, "08:00").toISOString(), updated_at: localTime(DAY, "08:00").toISOString(),
    ...o,
  } as StoBookingRow;
}

const ROWS = [
  row({ id: 1, from: "09:00", to: "10:00", post: 2, status: "done" }),
  row({ id: 2, from: "13:30", to: "15:00", post: 2 }),
  row({ id: 3, from: "15:00", to: "15:45", post: 2, status: "new" }),
  row({ id: 4, from: "16:00", to: "17:00", post: 1 }),
  row({ id: 5, from: "17:00", to: "18:00", post: 2, status: "cancelled" }),
];

describe("записи мастера", () => {
  it("без привязок — записи его поста, отменённые не в счёт", () => {
    expect(masterBookings(ROWS, [], 7, 2).map(b => b.id)).toEqual([1, 2, 3]);
  });

  // Ловушка: привязка есть у одной записи, а остальные на посту — тоже мои.
  it("привязка перекрывает пост: чужая запись на моём посту уходит, моя с чужого приходит", () => {
    const links = [{ bookingId: 2, masterId: 9 }, { bookingId: 4, masterId: 7 }];
    expect(masterBookings(ROWS, links, 7, 2).map(b => b.id)).toEqual([1, 3, 4]);
  });

  it("плавающий мастер без поста видит только привязанное", () => {
    expect(masterBookings(ROWS, [], 7, null)).toEqual([]);
    expect(masterBookings(ROWS, [{ bookingId: 4, masterId: 7 }], 7, null).map(b => b.id)).toEqual([4]);
  });
});

describe("сейчас и дальше", () => {
  const mine = masterBookings(ROWS, [], 7, 2);

  it("в работе — та, что идёт сейчас; на границе окна — следующая", () => {
    expect(jobNow(mine, localTime(DAY, "14:12"))?.id).toBe(2);
    expect(jobNow(mine, localTime(DAY, "15:00"))?.id).toBe(3);
    expect(jobNow(mine, localTime(DAY, "12:00"))).toBeNull();
  });

  it("выполненная запись не бывает «в работе», даже если по времени идёт", () => {
    expect(jobNow(mine, localTime(DAY, "09:30"))).toBeNull();
  });

  it("дальше — только то, что ещё не началось", () => {
    expect(jobsAfter(mine, localTime(DAY, "14:12")).map(b => b.id)).toEqual([3]);
    expect(jobsAfter(mine, localTime(DAY, "18:30"))).toEqual([]);
  });

  it("«Осмотр» ведёт на текущую, иначе на ближайшую, иначе никуда", () => {
    expect(inspectTarget(mine, localTime(DAY, "14:12"))?.id).toBe(2);
    expect(inspectTarget(mine, localTime(DAY, "12:00"))?.id).toBe(2);
    expect(inspectTarget(mine, localTime(DAY, "18:30"))).toBeNull();
  });
});

describe("осталось N мин", () => {
  const ends = localTime(DAY, "15:00");

  it("считает вверх: полминуты — ещё минута", () => {
    expect(minutesLeft(ends, localTime(DAY, "14:12"))).toBe(48);
    expect(minutesLeft(ends, new Date(ends.getTime() - 30_000))).toBe(1);
  });

  it("просроченная — ноль, а не минус", () => {
    expect(minutesLeft(ends, localTime(DAY, "15:20"))).toBe(0);
  });

  it("занято — сумма длительностей", () => {
    expect(busyMinutes(masterBookings(ROWS, [], 7, 2))).toBe(60 + 90 + 45);
  });
});
