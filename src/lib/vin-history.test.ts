import { describe, expect, it } from "vitest";
import { vinFromHistory } from "./vin-history";
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
