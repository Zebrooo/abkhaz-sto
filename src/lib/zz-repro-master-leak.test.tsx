import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { can } from "@/lib/access";

const schedule: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "18:00" }], tue: [{ from: "09:00", to: "18:00" }],
    wed: [{ from: "09:00", to: "18:00" }], thu: [{ from: "09:00", to: "18:00" }],
    fri: [{ from: "09:00", to: "18:00" }], sat: [{ from: "09:00", to: "18:00" }],
    sun: [{ from: "09:00", to: "18:00" }],
  },
  posts: 2, stepMin: 30, bufferMin: 0, daysOff: [],
};

const shop = { id: 1, name: "СТО", slug: null, storefrontStatus: "active", address: "", regionSlug: null,
  schedule, scheduleRaw: null, prepay: { mode: "off" }, owned: false,
  membership: { active: true, role: "master", masterId: 7 } };

// Мастер — роль контекста. requireSection("bookings") её пропускает.
const ctx = { shop, userId: "u1", role: "master", realRole: "master", viewing: false, masterId: 7 };

function row(o: { id: number; at: string; name: string; phone: string; brand: string; plate: string; vin: string }): StoBookingRow {
  return {
    id: o.id, shop_id: 1, client_id: null, vehicle_id: null, listing_id: 10,
    service: { title: "Замена масла", price: 1500, currency: "RUB", durationMin: 60 },
    starts_at: o.at, ends_at: o.at, post_no: 1, status: "done",
    cancelled_by: null, source: "app", prepay_amount: 0, prepay_status: "none",
    data: { client: { name: o.name, phone: o.phone }, vehicle: { brand: o.brand, model: "X", year: 2020, plate: o.plate, vin: o.vin } },
    created_at: o.at, updated_at: o.at,
  } as StoBookingRow;
}

// Вся база сервиса: ни одна из этих записей не относится к мастеру №7.
const history = [
  row({ id: 1, at: "2026-09-15T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Lada", plate: "А 123 АВ", vin: "XTA21099062000001" }),
  row({ id: 2, at: "2026-09-14T06:00:00Z", name: "Нана Джопуа", phone: "+79401184590", brand: "Kia", plate: "В 777 ВС", vin: "KNADN512BF6000002" }),
];

vi.mock("@/lib/context", () => ({
  requireSection: vi.fn(async () => ctx),
  serviceContext: vi.fn(async () => ctx),
}));
vi.mock("@/lib/bookings", () => ({
  countPending: vi.fn(async () => 0),
  busyIntervals: vi.fn(async () => []),
  recentBookings: vi.fn(async () => history),
}));
vi.mock("@/lib/services", () => ({
  listServices: vi.fn(async () => [{ listingId: 10, slug: "oil", title: "Замена масла", price: 1500, currency: "RUB", durationMin: 60, status: "active" }]),
}));
vi.mock("@/app/(app)/actions", () => ({ createManualAction: vi.fn(async () => {}) }));

import NewBookingPage from "@/app/(app)/kalendar/novaya/page";
import { ClientPick } from "@/components/ClientPick";

/** Ищем в дереве, которое сервер отдаст браузеру, элемент ClientPick. */
function findClientPick(node: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const n of node) { const f = findClientPick(n); if (f) return f; }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === ClientPick) return el;
  return findClientPick(el.props?.children);
}

describe("РЕПРО: ручная запись у мастера", () => {
  it("мастеру раздел «Клиенты» закрыт, а «Записи» открыты — гейт экрана его пускает", () => {
    expect(can("master", "clients")).toBe(false);
    expect(can("master", "bookings")).toBe(true);
  });

  it("экран отдаёт мастеру всю базу клиентов с телефонами, номерами и VIN", async () => {
    const tree = await NewBookingPage({ searchParams: Promise.resolve({}) });
    const pick = findClientPick(tree);
    expect(pick, "ClientPick не нашёлся в дереве").not.toBeNull();
    const known = (pick!.props as { clients: Array<Record<string, unknown>> }).clients;
    console.log("ПРОП, УЕЗЖАЮЩИЙ В БРАУЗЕР МАСТЕРА:", JSON.stringify(known, null, 2));
    expect(known).toHaveLength(2);
    expect(known.map(c => c.phone)).toEqual(["+79409211408", "+79401184590"]);
    expect(known.map(c => c.plate)).toEqual(["А 123 АВ", "В 777 ВС"]);
    expect(known.map(c => c.vin)).toEqual(["XTA21099062000001", "KNADN512BF6000002"]);
  });
});
