import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientVinRows: vi.fn(),
  setBookingVin: vi.fn(),
}));
vi.mock("@/lib/bookings", () => ({ clientVinRows: mocks.clientVinRows, setBookingVin: mocks.setBookingVin }));
vi.mock("@/lib/clients", () => ({ clientKey: () => "p:+79400000001" }));

import { ensureBookingVin, vinFromHistory } from "./vin-history";
import type { StoBookingRow } from "@/lib/sto/types";

const row = (over: Partial<{ plate: string | null; vin: string | null }> = {}) => ({
  data: {
    client: { name: "Аслан", phone: "+79400000001" },
    vehicle: { brand: "Kia", model: null, year: null, plate: over.plate ?? null, vin: over.vin ?? null },
  },
} as unknown as StoBookingRow);

describe("vinFromHistory", () => {
  it("по совпадению госномера — и в разном написании (кириллица/латиница)", () => {
    expect(vinFromHistory([row({ plate: "В777ОР", vin: "VIN123456" })], row({ plate: "B777OP" }))).toBe("VIN123456");
  });

  it("номера нет — только когда у клиента ровно один различный VIN", () => {
    expect(vinFromHistory([row({ vin: "VIN123456" }), row({ vin: "VIN123456" })], row())).toBe("VIN123456");
    expect(vinFromHistory([row({ vin: "VIN111111" }), row({ vin: "VIN222222" })], row())).toBeNull();
  });

  it("номер есть, но в истории он с другим VIN не встречался — null, чужой VIN не берём", () => {
    expect(vinFromHistory([row({ plate: "А001АА", vin: "VIN999999" })], row({ plate: "B777OP" }))).toBeNull();
  });

  it("у записи уже есть VIN — null: добирать нечего", () => {
    expect(vinFromHistory([row({ vin: "VIN123456" })], row({ vin: "OWN000001" }))).toBeNull();
  });

  it("пустая история — null", () => {
    expect(vinFromHistory([], row())).toBeNull();
  });
});

describe("ensureBookingVin — ленивое дописывание при чтении", () => {
  beforeEach(() => vi.clearAllMocks());

  it("история дала VIN — сохраняем и отдаём обновлённую запись", async () => {
    const b = { ...row({ plate: "В777ОР" }), id: 100 } as StoBookingRow;
    mocks.clientVinRows.mockResolvedValue([{ ...row({ plate: "В777ОР", vin: "VIN123456" }), id: 90 }]);
    const updated = { ...b, data: { ...b.data, vehicle: { ...b.data.vehicle!, vin: "VIN123456" } } };
    mocks.setBookingVin.mockResolvedValue(updated);
    expect(await ensureBookingVin(7, b)).toBe(updated);
    expect(mocks.setBookingVin).toHaveBeenCalledWith(7, 100, "VIN123456");
  });

  it("свою же запись из истории вычёркиваем — сама с собой она не сверяется", async () => {
    const b = { ...row({ plate: "В777ОР" }), id: 100 } as StoBookingRow;
    mocks.clientVinRows.mockResolvedValue([{ ...row({ plate: "В777ОР", vin: "VIN123456" }), id: 100 }]);
    expect(await ensureBookingVin(7, b)).toBe(b);
    expect(mocks.setBookingVin).not.toHaveBeenCalled();
  });

  it("истории нет — запись как была, апдейтов нет", async () => {
    const b = { ...row(), id: 100 } as StoBookingRow;
    mocks.clientVinRows.mockResolvedValue([]);
    expect(await ensureBookingVin(7, b)).toBe(b);
    expect(mocks.setBookingVin).not.toHaveBeenCalled();
  });

  it("VIN уже есть — в базу не ходим вовсе", async () => {
    const b = { ...row({ vin: "OWN000001" }), id: 100 } as StoBookingRow;
    expect(await ensureBookingVin(7, b)).toBe(b);
    expect(mocks.clientVinRows).not.toHaveBeenCalled();
  });
});
