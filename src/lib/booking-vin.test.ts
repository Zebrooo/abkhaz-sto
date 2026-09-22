import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoBookingRow } from "@/lib/sto/types";

// Табличный записывающий мок: важно РАЗЛИЧАТЬ sto_bookings и user_vehicles —
// обратная запись VIN в гараж обязана бить только по второй и только в пустое поле.
const mocks = vi.hoisted(() => ({
  booking: null as unknown,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or", "update", "in", "limit", "order", "returns", "maybeSingle"]) {
        b[m] = (...args: unknown[]) => { mocks.calls.push({ table, method: m, args }); return b; };
      }
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.booking, error: null }).then(resolve);
      return b;
    },
  }),
}));
vi.mock("@/lib/site-events", () => ({ notifySite: vi.fn(async () => true) }));

import { setBookingVin } from "@/lib/bookings";

const booking = (over: Partial<StoBookingRow> = {}): StoBookingRow => ({
  id: 100, shop_id: 7, client_id: "u1", vehicle_id: null, listing_id: 5,
  service: { title: "Диагностика", price: 1000, currency: "RUB", durationMin: 60 },
  starts_at: "2026-09-22T07:00:00Z", ends_at: "2026-09-22T08:00:00Z", post_no: 1,
  status: "new", cancelled_by: null, source: "site", prepay_amount: 0, prepay_status: "none",
  created_at: "2026-09-21T10:00:00Z", updated_at: "2026-09-21T10:00:00Z",
  data: { client: { name: "Аслан", phone: "+79400000001" }, vehicle: { brand: "Kia", model: "Rio", year: 2021, plate: "B777OP" }, comment: "стучит" },
  ...over,
} as StoBookingRow);

const updates = (table: string) => mocks.calls.filter(c => c.table === table && c.method === "update");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.booking = booking();
});

describe("setBookingVin", () => {
  it("VIN дописан в data.vehicle, остальное data цело; без vehicle_id гараж не трогаем", async () => {
    const res = await setBookingVin(7, 100, "XWEFB123-45");
    expect(res?.data.vehicle?.vin).toBe("XWEFB123-45");
    const [u] = updates("sto_bookings");
    const sent = (u.args[0] as { data: StoBookingRow["data"] }).data;
    expect(sent.vehicle).toMatchObject({ brand: "Kia", plate: "B777OP", vin: "XWEFB123-45" });
    expect(sent.comment).toBe("стучит");
    expect(updates("user_vehicles")).toHaveLength(0);
  });

  it("с vehicle_id — VIN уезжает и в гараж, но только в пустое поле", async () => {
    mocks.booking = booking({ vehicle_id: 42 });
    await setBookingVin(7, 100, "XWEFB123-45");
    const [g] = updates("user_vehicles");
    expect(g.args[0]).toEqual({ vin: "XWEFB123-45" });
    const or = mocks.calls.find(c => c.table === "user_vehicles" && c.method === "or");
    expect(or?.args[0]).toBe("vin.is.null,vin.eq.");
    const id = mocks.calls.find(c => c.table === "user_vehicles" && c.method === "eq");
    expect(id?.args).toEqual(["id", 42]);
  });

  it("записи нет — null, никаких апдейтов", async () => {
    mocks.booking = null;
    expect(await setBookingVin(7, 100, "XWEFB123-45")).toBeNull();
    expect(updates("sto_bookings")).toHaveLength(0);
  });
});
