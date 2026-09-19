import { beforeEach, describe, expect, it, vi } from "vitest";

// Записываемый билдер запроса: каждый вызов складывается в mocks.calls,
// await билдера (без .returns()) и await .returns() отдают mocks.result.
const mocks = vi.hoisted(() => ({
  result: { data: [] as unknown[], count: null as number | null, error: null as { message: string } | null },
  calls: [] as { method: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "lt", "gt", "gte", "not", "is", "or", "order", "limit", "in", "maybeSingle"]) {
        builder[m] = (...args: unknown[]) => {
          mocks.calls.push({ method: m, args });
          return builder;
        };
      }
      builder.returns = () => Promise.resolve(mocks.result);
      builder.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(mocks.result).then(onF, onR);
      return builder;
    },
  }),
}));
// site-events тянет приватный пакет подписи — тестам он не нужен.
vi.mock("@/lib/site-events", () => ({ notifySite: vi.fn(async () => true) }));

import { countClientVisits, vehicleVisits } from "@/lib/bookings";
import { vehiclePast } from "@/lib/vehicles";
import type { StoBookingRow } from "@/lib/sto/types";

/** Запись-приёмка: текущая, про неё собирают досье. */
const booking = (vehicle: StoBookingRow["data"]["vehicle"]): StoBookingRow => ({
  id: 100, shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
  service: { title: "Диагностика", price: 1000, currency: "RUB", durationMin: 60 },
  starts_at: "2026-09-15T06:00:00Z", ends_at: "2026-09-15T07:00:00Z", post_no: 1,
  status: "confirmed", cancelled_by: null, source: "app", prepay_amount: 0, prepay_status: "none",
  data: { client: { name: "Аслан", phone: "+79409211408" }, ...(vehicle ? { vehicle } : {}) },
  created_at: "2026-09-10T06:00:00Z", updated_at: "2026-09-10T06:00:00Z",
});

/** Лёгкая строка прошлого визита — то, что отдаёт vehicleVisits. */
const pastRow = (id: number, plate: string | null, at: string) => ({
  id, client_id: null,
  service: { title: "Замена масла", price: 2000, currency: "RUB" as const, durationMin: 60 },
  starts_at: at, status: "done" as const,
  data: { client: { name: "Аслан", phone: "+79409211408" }, vehicle: { brand: "Lada", model: "Vesta", year: 2021, plate, vin: null } },
});

beforeEach(() => {
  mocks.calls = [];
  mocks.result = { data: [], count: null, error: null };
});

describe("vehicleVisits", () => {
  it("не сравнивает признаки машины в SQL: только сервис, время, порядок и лимит", async () => {
    // Сравнение сырого текста снимка (data->vehicle->>plate.eq.…) теряло ту же
    // машину, набранную в другой раскладке или регистре: склейка с
    // нормализацией живёт в vehiclePast, и SQL обязан отдавать надмножество.
    mocks.result = { data: [pastRow(1, "А 123 АВ 01", "2026-09-01T06:00:00Z")], count: null, error: null };
    const rows = await vehicleVisits(1, booking({ brand: "Lada", model: "Vesta", year: 2021, plate: "A123AB01", vin: null }));
    expect(rows).toHaveLength(1);
    const filters = mocks.calls.filter(c => ["eq", "lt", "or", "not", "is"].includes(c.method));
    expect(filters).toEqual([
      { method: "eq", args: ["shop_id", 1] },
      { method: "lt", args: ["starts_at", "2026-09-15T06:00:00Z"] },
    ]);
    expect(mocks.calls).toContainEqual({ method: "order", args: ["starts_at", { ascending: false }] });
    expect(mocks.calls).toContainEqual({ method: "limit", args: [200] });
  });

  it("номер в другой раскладке и с пробелами — та же машина для vehiclePast", async () => {
    // Регрессия блокера: приложение хранит написание человека, поэтому «А 123
    // АВ 01» в прошлой записи и «A123AB01» в текущей — одна машина, и досье
    // обязано найти визит, а не сказать «машина впервые».
    mocks.result = {
      data: [
        pastRow(2, "В 777 ВВ 77", "2026-09-05T06:00:00Z"),
        pastRow(1, "А 123 АВ 01", "2026-09-01T06:00:00Z"),
      ],
      count: null, error: null,
    };
    const rows = await vehicleVisits(1, booking({ brand: "Lada", model: "Vesta", year: 2021, plate: "A123AB01", vin: null }));
    const past = vehiclePast(rows, booking({ brand: "Lada", model: "Vesta", year: 2021, plate: "A123AB01", vin: null }));
    expect(past.visits.map(v => v.id)).toEqual([1]);
    expect(past.done).toBe(1);
  });

  it("машины в записи нет — в базу не ходим", async () => {
    const rows = await vehicleVisits(1, booking(undefined));
    expect(rows).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });
});

describe("countClientVisits", () => {
  it("учётка — точный count с окном истории, строки не читаются", async () => {
    mocks.result = { data: [], count: 5, error: null };
    await expect(countClientVisits(1, "u123e4567-e89b")).resolves.toBe(5);
    expect(mocks.calls).toContainEqual({ method: "eq", args: ["client_id", "123e4567-e89b"] });
    const gte = mocks.calls.find(c => c.method === "gte");
    expect(gte?.args[0]).toBe("starts_at");
  });

  it("телефонный ключ — грубый предфильтр с окном, точный отбор в JS", async () => {
    mocks.result = {
      data: [
        { id: 1, client_id: null, client: { name: "Аслан", phone: "+7 940 921-14-08" } },
        { id: 2, client_id: null, client: { name: "Другой", phone: "+79400000000" } },
      ],
      count: null, error: null,
    };
    await expect(countClientVisits(1, "p79409211408")).resolves.toBe(1);
    expect(mocks.calls).toContainEqual({ method: "not", args: ["data->client->>phone", "is", null] });
    expect(mocks.calls.some(c => c.method === "gte" && c.args[0] === "starts_at")).toBe(true);
  });
});
