// Карточка машины — как и карточка клиента, свод по записям сервиса: своей
// базы машин у приложения нет и не будет (AGENTS.md), а «что мы делали этой
// машине» собирается из снимков записи (data.vehicle).
//
// Почему машина — отдельная карточка, а не строчка в карточке человека:
//  - у одного человека машин бывает несколько, и «масло менял в июне» — это
//    про конкретную, а не про него;
//  - машина переживает владельца: её продают, и новый хозяин приезжает на
//    ту же машину. История ремонта при этом никуда не девается, поэтому
//    владельцы у карточки — списком, а не одним полем.
//
// Ключ — госномер: он и написан на машине, и его называют по телефону.
// Номера нет — склеиваем по марке, модели и году: две «Лады Весты 2021»
// одного сервиса без номеров в одну карточку и сольются, и это честнее, чем
// заводить карточку на каждую запись.
import type { StoBookingRow, StoBookingVehicleSnapshot } from "@/lib/sto/types";
import { clientKey } from "@/lib/clients";
import { normalizePhone } from "@/lib/phone";

export type VehicleOwner = {
  /** Ключ карточки клиента (lib/clients.ts). */
  key: string;
  name: string;
  phone: string | null;
  /** Последняя запись этого человека на эту машину. */
  lastAt: string;
};

export type VehicleSummary = {
  /** Ключ для адреса /mashiny/<key>. */
  key: string;
  /** «Lada Vesta 2021» — как машину зовут в списке. */
  name: string;
  plate: string | null;
  year: number | null;
  visits: number;
  lastAt: string;
  /** Деньги по выполненным записям. */
  spent: number;
  /** Кто на ней приезжал, свежие сверху: машину продают, история остаётся. */
  owners: VehicleOwner[];
};

export type VehicleCard = VehicleSummary & { history: StoBookingRow[] };

/** Номер к сравнимому виду: без пробелов и дефисов, в верхнем регистре. */
export function normalizePlate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/[\s-]+/g, "").toUpperCase();
  return s.length >= 4 ? s : null;
}

/** «Lada Vesta 2021» — марка, модель и год одной строкой. */
export function vehicleName(v: StoBookingVehicleSnapshot): string {
  return [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ").trim() || "Машина";
}

/**
 * Ключ машины: госномер, иначе марка-модель-год. null — в записи машины
 * вовсе нет (клиент приехал «на посмотреть»), и карточке взяться неоткуда.
 */
export function vehicleKey(v: StoBookingVehicleSnapshot | undefined): string | null {
  if (!v) return null;
  const plate = normalizePlate(v.plate);
  if (plate) return `p${plate}`;
  const name = vehicleName(v).toLowerCase();
  return name === "машина" ? null : `m${encodeURIComponent(name)}`;
}

function ownerOf(b: StoBookingRow): VehicleOwner {
  return {
    key: clientKey(b),
    name: b.data.client?.name?.trim() || (b.client_id ? "Клиент с сайта" : "Клиент"),
    phone: normalizePhone(b.data.client?.phone) ?? null,
    lastAt: b.starts_at,
  };
}

/** Свод машин по записям, свежие визиты сверху. */
export function summarizeVehicles(rows: readonly StoBookingRow[]): VehicleSummary[] {
  const map = new Map<string, VehicleSummary>();
  for (const b of rows) {
    const v = b.data.vehicle;
    const key = vehicleKey(v);
    if (!key || !v) continue;
    const spent = b.status === "done" ? (b.service.price ?? 0) : 0;
    const owner = ownerOf(b);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        key, name: vehicleName(v), plate: normalizePlate(v.plate), year: v.year ?? null,
        visits: 1, lastAt: b.starts_at, spent, owners: [owner],
      });
      continue;
    }
    prev.visits += 1;
    prev.spent += spent;
    // Записи приходят свежими сверху, но функция чистая — сравниваем честно.
    if (b.starts_at > prev.lastAt) {
      prev.lastAt = b.starts_at;
      prev.name = vehicleName(v);
      prev.year = v.year ?? prev.year;
    }
    prev.plate = prev.plate ?? normalizePlate(v.plate);
    const known = prev.owners.find(o => o.key === owner.key);
    if (!known) prev.owners.push(owner);
    else if (owner.lastAt > known.lastAt) known.lastAt = owner.lastAt;
  }
  for (const v of map.values()) v.owners.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Карточка одной машины: чья она, что делали и когда. */
export function vehicleCard(rows: readonly StoBookingRow[], key: string): VehicleCard | null {
  const mine = rows.filter(b => vehicleKey(b.data.vehicle) === key);
  if (mine.length === 0) return null;
  const summary = summarizeVehicles(mine)[0];
  return { ...summary, history: [...mine].sort((a, b) => b.starts_at.localeCompare(a.starts_at)) };
}

/** Машины одного клиента — свежие сверху; ими же заполняется форма записи. */
export function clientVehicles(rows: readonly StoBookingRow[], key: string): VehicleSummary[] {
  return summarizeVehicles(rows.filter(b => clientKey(b) === key));
}

/**
 * Машины каждого клиента: ключ карточки клиента → названия его машин.
 * Нужно форме записи, где строка имени подставляет машину: пробегать записи
 * заново для каждого клиента в списке — лишняя работа на каждый рендер.
 * Порядок — как у свода машин, свежие визиты сверху.
 */
export function carsByClient(rows: readonly StoBookingRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of summarizeVehicles(rows)) {
    for (const o of v.owners) {
      const list = out.get(o.key) ?? [];
      if (!list.includes(v.name)) list.push(v.name);
      out.set(o.key, list);
    }
  }
  return out;
}
