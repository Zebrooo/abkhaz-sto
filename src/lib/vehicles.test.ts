import { describe, expect, it } from "vitest";
import {
  carsByClient, clientVehicles, normalizePlate, sameVehicle, summarizeVehicles,
  vehicleCard, vehicleKey, vehicleName, vehiclePast,
} from "@/lib/vehicles";
import type { StoBookingRow, StoBookingStatus } from "@/lib/sto/types";

type Make = {
  id: number;
  at: string;
  name?: string;
  phone?: string | null;
  brand?: string;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
  price?: number | null;
  status?: StoBookingStatus;
};

const row = (m: Make): StoBookingRow => ({
  id: m.id, shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
  service: { title: "Замена масла", price: m.price ?? 2000, currency: "RUB", durationMin: 60 },
  starts_at: m.at, ends_at: m.at, post_no: 1, status: m.status ?? "done",
  cancelled_by: null, source: "app", prepay_amount: 0, prepay_status: "none",
  data: {
    client: { name: m.name ?? "Аслан", phone: m.phone ?? "+79409211408" },
    ...(m.brand === undefined && m.plate === undefined ? {} : {
      vehicle: { brand: m.brand ?? "Lada", model: m.model ?? "Vesta", year: m.year ?? 2021, plate: m.plate ?? null },
    }),
  },
  created_at: m.at, updated_at: m.at,
});

describe("normalizePlate и vehicleName", () => {
  it("номер без пробелов и в верхнем регистре", () => {
    expect(normalizePlate("а 123 ав-01")).toBe("А123АВ01");
    expect(normalizePlate("а12")).toBe(null);
    expect(normalizePlate(null)).toBe(null);
  });

  it("имя машины — марка, модель и год", () => {
    expect(vehicleName({ brand: "Lada", model: "Vesta", year: 2021, plate: null })).toBe("Lada Vesta 2021");
    expect(vehicleName({ brand: "Lada", model: null, year: null, plate: null })).toBe("Lada");
  });
});

describe("vehicleKey", () => {
  it("номер важнее марки: та же машина под другим названием — одна карточка", () => {
    const a = vehicleKey({ brand: "Lada", model: "Vesta", year: 2021, plate: "А123АВ01" });
    const b = vehicleKey({ brand: "ВАЗ", model: "Веста", year: 2021, plate: "а 123 ав 01" });
    expect(a).toBe(b);
  });

  it("без номера ключ собирается из марки, модели и года", () => {
    expect(vehicleKey({ brand: "Lada", model: "Vesta", year: 2021, plate: null }))
      .not.toBe(vehicleKey({ brand: "Lada", model: "Vesta", year: 2020, plate: null }));
  });

  it("машины в записи нет — и карточки нет", () => {
    expect(vehicleKey(undefined)).toBe(null);
  });
});

describe("summarizeVehicles", () => {
  it("склеивает визиты одной машины и считает деньги по выполненным", () => {
    const [v] = summarizeVehicles([
      row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01", price: 3000 }),
      row({ id: 2, at: "2026-06-01T06:00:00Z", plate: "а123ав01", price: 2000 }),
      row({ id: 3, at: "2026-05-01T06:00:00Z", plate: "А123АВ01", price: 5000, status: "cancelled" }),
    ]);
    expect(v.visits).toBe(3);
    expect(v.spent).toBe(5000);
    expect(v.plate).toBe("А123АВ01");
    expect(v.lastAt).toBe("2026-09-15T06:00:00Z");
  });

  it("машину продали — оба владельца в карточке, свежий сверху", () => {
    const [v] = summarizeVehicles([
      row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01", name: "Мария", phone: "+79409990022" }),
      row({ id: 2, at: "2026-02-01T06:00:00Z", plate: "А123АВ01", name: "Аслан", phone: "+79409211408" }),
    ]);
    expect(v.owners.map(o => o.name)).toEqual(["Мария", "Аслан"]);
  });

  it("один владелец два раза — одна строка, а не две", () => {
    const [v] = summarizeVehicles([
      row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01" }),
      row({ id: 2, at: "2026-08-15T06:00:00Z", plate: "А123АВ01" }),
    ]);
    expect(v.owners).toHaveLength(1);
    expect(v.owners[0].lastAt).toBe("2026-09-15T06:00:00Z");
  });

  it("имя и год берём из свежей записи: машину переименовали — карточка не отстаёт", () => {
    const [v] = summarizeVehicles([
      row({ id: 1, at: "2026-01-01T06:00:00Z", plate: "А123АВ01", brand: "ВАЗ", model: "Веста", year: 2021 }),
      row({ id: 2, at: "2026-09-15T06:00:00Z", plate: "А123АВ01", brand: "Lada", model: "Vesta Cross", year: 2021 }),
    ]);
    expect(v.name).toBe("Lada Vesta Cross 2021");
  });

  it("записи без машины пропускаем", () => {
    expect(summarizeVehicles([row({ id: 1, at: "2026-09-15T06:00:00Z", brand: undefined, plate: undefined })])).toEqual([]);
  });

  it("разные машины — разные карточки, свежая сверху", () => {
    const list = summarizeVehicles([
      row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "Б222ВВ01", brand: "Toyota", model: "Camry", year: 2015 }),
      row({ id: 2, at: "2026-09-01T06:00:00Z", plate: "А123АВ01" }),
    ]);
    expect(list.map(v => v.plate)).toEqual(["Б222ВВ01", "А123АВ01"]);
  });
});

describe("vehicleCard и clientVehicles", () => {
  const rows = [
    row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01" }),
    row({ id: 2, at: "2026-08-01T06:00:00Z", plate: "А123АВ01" }),
    row({ id: 3, at: "2026-07-01T06:00:00Z", plate: "Б222ВВ01", brand: "Toyota", model: "Camry", year: 2015 }),
    row({ id: 4, at: "2026-06-01T06:00:00Z", plate: "В333СС01", name: "Мария", phone: "+79409990022" }),
  ];

  it("карточка машины — её история, свежая сверху", () => {
    const card = vehicleCard(rows, "pА123АВ01");
    expect(card?.history.map(b => b.id)).toEqual([1, 2]);
    expect(card?.visits).toBe(2);
  });

  it("чужой ключ — ничего", () => {
    expect(vehicleCard(rows, "pНЕТ111")).toBeNull();
  });

  it("машины клиента — только его, свежие сверху", () => {
    const mine = clientVehicles(rows, "p79409211408");
    expect(mine.map(v => v.plate)).toEqual(["А123АВ01", "Б222ВВ01"]);
  });
});

describe("carsByClient", () => {
  it("у каждого клиента свои машины, проданная — у обоих", () => {
    const map = carsByClient([
      row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01" }),
      row({ id: 2, at: "2026-09-10T06:00:00Z", plate: "Б222ВВ01", brand: "Toyota", model: "Camry", year: 2015 }),
      row({ id: 3, at: "2026-02-01T06:00:00Z", plate: "А123АВ01", name: "Мария", phone: "+79409990022" }),
    ]);
    expect(map.get("p79409211408")).toEqual(["Lada Vesta 2021", "Toyota Camry 2015"]);
    expect(map.get("p79409990022")).toEqual(["Lada Vesta 2021"]);
  });

  it("записи без машины ничего не добавляют", () => {
    expect(carsByClient([row({ id: 1, at: "2026-09-15T06:00:00Z", brand: undefined, plate: undefined })]).size).toBe(0);
  });
});

describe("sameVehicle", () => {
  const a = row({ id: 1, at: "2026-09-15T06:00:00Z", plate: "А123АВ01" });

  it("тот же номер в другом написании — та же машина", () => {
    expect(sameVehicle(a, row({ id: 2, at: "2026-08-01T06:00:00Z", plate: "а 123 ав 01" }))).toBe(true);
  });

  it("другая машина — не та же", () => {
    expect(sameVehicle(a, row({ id: 2, at: "2026-08-01T06:00:00Z", plate: "Б222ВВ01" }))).toBe(false);
  });

  it("записи без машины не слипаются в одну", () => {
    const x = row({ id: 3, at: "2026-09-01T06:00:00Z", brand: undefined, plate: undefined });
    const y = row({ id: 4, at: "2026-09-02T06:00:00Z", brand: undefined, plate: undefined });
    expect(sameVehicle(x, y)).toBe(false);
  });

  it("id машины из гаража важнее снимка", () => {
    const g1 = { ...row({ id: 5, at: "2026-09-01T06:00:00Z", plate: "А123АВ01" }), vehicle_id: 42 };
    const g2 = { ...row({ id: 6, at: "2026-09-02T06:00:00Z", brand: "Kia", model: "Rio", year: 2014, plate: "Б222ВВ01" }), vehicle_id: 42 };
    expect(sameVehicle(g1, g2)).toBe(true);
  });
});

describe("vehiclePast — что машине уже делали", () => {
  const now = row({ id: 100, at: "2026-09-17T06:00:00Z", plate: "А123АВ01", status: "confirmed" });

  it("берёт только прошлые визиты этой машины, свежие сверху", () => {
    const past = vehiclePast([
      now,
      row({ id: 1, at: "2026-09-10T06:00:00Z", plate: "А123АВ01" }),
      row({ id: 2, at: "2026-06-10T06:00:00Z", plate: "а123ав01" }),
      row({ id: 3, at: "2026-09-20T06:00:00Z", plate: "А123АВ01", status: "confirmed" }),
      row({ id: 4, at: "2026-09-12T06:00:00Z", plate: "Б222ВВ01" }),
    ], now);
    expect(past.visits.map(v => v.id)).toEqual([1, 2]);
    expect(past.done).toBe(2);
  });

  it("отменённые и неявки визитами не считаются", () => {
    const past = vehiclePast([
      now,
      row({ id: 1, at: "2026-09-10T06:00:00Z", plate: "А123АВ01", status: "cancelled" }),
      row({ id: 2, at: "2026-09-11T06:00:00Z", plate: "А123АВ01", status: "no_show" }),
      row({ id: 3, at: "2026-09-12T06:00:00Z", plate: "А123АВ01", status: "confirmed" }),
    ], now);
    expect(past.visits.map(v => v.id)).toEqual([3]);
    expect(past.done).toBe(0);
  });

  it("машина без номера: чужую историю не подмешиваем", () => {
    const anon = row({ id: 200, at: "2026-09-17T06:00:00Z", plate: null, status: "confirmed" });
    const past = vehiclePast([
      anon,
      row({ id: 1, at: "2026-09-10T06:00:00Z", plate: null }),
      row({ id: 2, at: "2026-09-11T06:00:00Z", plate: null, name: "Мария", phone: "+79409990022" }),
    ], anon);
    expect(past.byName).toBe(true);
    expect(past.visits.map(v => v.id)).toEqual([1]);
  });

  it("машины в записи нет — и прошлого нет", () => {
    const empty = row({ id: 300, at: "2026-09-17T06:00:00Z", brand: undefined, plate: undefined });
    expect(vehiclePast([empty, row({ id: 1, at: "2026-09-10T06:00:00Z", brand: undefined, plate: undefined })], empty).key).toBeNull();
  });

  it("прежний владелец виден, нынешний в этот список не попадает", () => {
    const past = vehiclePast([
      now,
      row({ id: 1, at: "2026-09-10T06:00:00Z", plate: "А123АВ01", name: "Мария", phone: "+79409990022" }),
      row({ id: 2, at: "2026-08-10T06:00:00Z", plate: "А123АВ01" }),
    ], now);
    expect(past.otherOwners.map(o => o.name)).toEqual(["Мария"]);
  });

  it("список визитов ограничен", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ id: i + 1, at: `2026-09-0${i + 1}T06:00:00Z`, plate: "А123АВ01" }));
    expect(vehiclePast([now, ...rows], now, 3).visits).toHaveLength(3);
    expect(vehiclePast([now, ...rows], now, 3).done).toBe(8);
  });
});
