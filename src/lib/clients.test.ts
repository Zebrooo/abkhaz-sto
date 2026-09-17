import { describe, expect, it } from "vitest";
import { clientCard, clientKey, matchClient, summarizeClients } from "@/lib/clients";
import type { StoBookingRow } from "@/lib/sto/types";

function row(o: {
  id: number; at: string; clientId?: string | null; name?: string; phone?: string | null;
  brand?: string; model?: string; year?: number; plate?: string; status?: StoBookingRow["status"]; price?: number | null;
}): StoBookingRow {
  return {
    id: o.id, shop_id: 1, client_id: o.clientId ?? null, vehicle_id: null, listing_id: null,
    service: { title: "Замена масла", price: o.price === undefined ? 1500 : o.price, currency: "RUB", durationMin: 60 },
    starts_at: o.at, ends_at: o.at, post_no: 1, status: o.status ?? "done",
    cancelled_by: null, source: "app", prepay_amount: 0, prepay_status: "none",
    data: {
      ...(o.name ? { client: { name: o.name, phone: o.phone ?? null } } : {}),
      ...(o.brand ? { vehicle: { brand: o.brand, model: o.model ?? null, year: o.year ?? null, plate: o.plate ?? null } } : {}),
    },
    created_at: o.at, updated_at: o.at,
  };
}

describe("ключ клиента", () => {
  it("учётка важнее телефона и имени", () => {
    expect(clientKey(row({ id: 1, at: "2026-09-01T09:00:00Z", clientId: "abc", name: "Аслан", phone: "+7 940 921-14-08" }))).toBe("uabc");
  });

  it("без учётки — телефон, и разная запись номера даёт один ключ", () => {
    const a = clientKey(row({ id: 1, at: "2026-09-01T09:00:00Z", name: "Аслан", phone: "+7 940 921-14-08" }));
    const b = clientKey(row({ id: 2, at: "2026-09-02T09:00:00Z", name: "А. Кове", phone: "8 940 921 14 08" }));
    expect(a).toBe(b);
  });

  it("без телефона два разных имени не сливаются в одного", () => {
    const a = clientKey(row({ id: 1, at: "2026-09-01T09:00:00Z", name: "Иван" }));
    const b = clientKey(row({ id: 2, at: "2026-09-02T09:00:00Z", name: "Пётр" }));
    expect(a).not.toBe(b);
  });
});

describe("свод клиентов", () => {
  const rows = [
    row({ id: 3, at: "2026-09-15T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Lada", model: "Vesta", year: 2021, plate: "А 123 АВ" }),
    row({ id: 2, at: "2026-06-14T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Kia", model: "Rio", year: 2014, status: "cancelled", price: 2200 }),
    row({ id: 1, at: "2026-03-03T06:00:00Z", name: "Нана Джопуа", phone: "+79401184590", brand: "Hyundai", model: "Solaris" }),
  ];

  it("склеивает визиты одного человека и считает деньги по выполненным", () => {
    const list = summarizeClients(rows);
    expect(list).toHaveLength(2);
    const aslan = list[0];
    expect(aslan.name).toBe("Аслан Кове");
    expect(aslan.visits).toBe(2);
    expect(aslan.spent).toBe(1500); // отменённая запись в деньги не идёт
    expect(aslan.car).toBe("Lada Vesta 2021"); // машина последнего визита
  });

  it("сортирует по свежести визита", () => {
    expect(summarizeClients(rows).map(c => c.name)).toEqual(["Аслан Кове", "Нана Джопуа"]);
  });

  it("порядок строк на входе не меняет итог", () => {
    const back = summarizeClients([...rows].reverse());
    expect(back[0].car).toBe("Lada Vesta 2021");
    expect(back[0].visits).toBe(2);
  });

  it("безымянная запись с сайта подписывается, а не теряется", () => {
    const [c] = summarizeClients([row({ id: 9, at: "2026-09-15T06:00:00Z", clientId: "u1" })]);
    expect(c.name).toBe("Клиент с сайта");
  });
});

describe("карточка клиента", () => {
  const rows = [
    row({ id: 3, at: "2026-09-15T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Lada", model: "Vesta", year: 2021, plate: "А 123 АВ" }),
    row({ id: 2, at: "2026-06-14T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Kia", model: "Rio", year: 2014, plate: "АБ 007 01" }),
  ];

  // Машины клиента считает lib/vehicles.ts (clientVehicles) — здесь только
  // контакты и история.
  it("история сверху вниз", () => {
    const card = clientCard(rows, clientKey(rows[0]))!;
    expect(card.history.map(h => h.id)).toEqual([3, 2]);
  });

  it("чужой ключ — ничего", () => {
    expect(clientCard(rows, "pнет")).toBeNull();
  });
});

describe("поиск клиента", () => {
  const [c] = summarizeClients([row({ id: 1, at: "2026-09-15T06:00:00Z", name: "Аслан Кове", phone: "+79409211408", brand: "Lada", model: "Vesta", year: 2021 })]);

  it("находит по имени, машине и куску номера", () => {
    expect(matchClient(c, "аслан")).toBe(true);
    expect(matchClient(c, "vesta")).toBe(true);
    expect(matchClient(c, "921-14")).toBe(true);
    expect(matchClient(c, "")).toBe(true);
  });

  it("чужое не находит", () => {
    expect(matchClient(c, "камри")).toBe(false);
  });

  // Строка «Имя» в ручной записи ищет тем же правилом, но карточки целиком
  // у неё нет — только имя, телефон и машина.
  it("хватает трёх полей, без остальной карточки", () => {
    const lite = { name: c.name, phone: c.phone, car: c.car };
    expect(matchClient(lite, "940 921")).toBe(true);
    expect(matchClient(lite, "КОВЕ")).toBe(true);
    expect(matchClient(lite, "+79409211408")).toBe(true);
  });

  it("две цифры номером не считаются — иначе «21» вытащит пол-базы", () => {
    expect(matchClient({ name: "Аслан", phone: "+79409211408", car: null }, "21")).toBe(false);
  });

  it("клиент без телефона и машины ищется по имени", () => {
    expect(matchClient({ name: "Гость", phone: null, car: null }, "гос")).toBe(true);
  });
});

describe("matchClient — номер и VIN", () => {
  const c = { name: "Аслан", phone: "+79409211408", car: "Lada Vesta 2021", plate: "А123АВ 01", vin: "JN1TCNT31U0012345" };

  it("по госномеру — в любой раскладке и с пробелами", () => {
    expect(matchClient(c, "а123ав")).toBe(true);
    expect(matchClient(c, "A123AB")).toBe(true);
    // Ищут и куском таблички: «сто двадцать три ав» — это он.
    expect(matchClient(c, "123 ав")).toBe(true);
  });

  it("по хвосту VIN — его и называют вслух", () => {
    expect(matchClient(c, "0012345")).toBe(true);
    expect(matchClient(c, "JN1TCNT")).toBe(true);
  });

  it("чужой номер не находит", () => {
    expect(matchClient(c, "Б222ВВ")).toBe(false);
  });

  it("карточка без машины по номеру не находится и не падает", () => {
    expect(matchClient({ name: "Гость", phone: null, car: null }, "А123АВ")).toBe(false);
  });
});
