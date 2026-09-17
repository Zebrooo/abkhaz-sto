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
import { isLive } from "@/lib/stats";
import { clientKey } from "@/lib/clients";
import { normalizePhone } from "@/lib/phone";
import { foldLookalike, normalizeVin } from "@/lib/vehicle-input";

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
  /** VIN — его называют в сервисе, когда номер уже сменился. */
  vin: string | null;
  year: number | null;
  visits: number;
  lastAt: string;
  /** Деньги по выполненным записям. */
  spent: number;
  /** Кто на ней приезжал, свежие сверху: машину продают, история остаётся. */
  owners: VehicleOwner[];
};

export type VehicleCard = VehicleSummary & { history: StoBookingRow[] };

/**
 * Номер к сравнимому виду: без пробелов и дефисов, в верхнем регистре и с
 * кириллицей, схлопнутой к латинице (lib/vehicle-input.ts). «А123АВ» с
 * русской раскладки и «A123AB» с латинской — одна машина, и в карточке они
 * обязаны слиться, а не завести две истории ремонта.
 */
export function normalizePlate(raw: string | null | undefined): string | null {
  const s = foldLookalike((raw ?? "").replace(/[\s-]+/g, ""));
  return s.length >= 4 ? s : null;
}

/** VIN снимка к сравнимому виду; null — его нет или это не VIN. */
export function vehicleVin(v: StoBookingVehicleSnapshot | undefined): string | null {
  return normalizeVin(v?.vin);
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
        key, name: vehicleName(v), plate: normalizePlate(v.plate), vin: vehicleVin(v), year: v.year ?? null,
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
    prev.vin = prev.vin ?? vehicleVin(v);
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

/** Машина клиента для формы записи: название, номер и VIN — всё, что подставляется в поля. */
export type ClientCar = { name: string; plate: string | null; vin: string | null };

/**
 * Машины каждого клиента: ключ карточки клиента → его машины. Нужно форме
 * записи, где выбор клиента подставляет машину вместе с номером и VIN:
 * пробегать записи заново для каждого клиента в списке — лишняя работа на
 * каждый рендер. Порядок — как у свода машин, свежие визиты сверху.
 *
 * Номер и VIN тут уже нормализованные: в форму подставляется то, чем машина
 * опознаётся, а не то, как её однажды набрали с опечаткой.
 */
export function carsByClient(rows: readonly StoBookingRow[]): Map<string, ClientCar[]> {
  const out = new Map<string, ClientCar[]>();
  for (const v of summarizeVehicles(rows)) {
    for (const o of v.owners) {
      const list = out.get(o.key) ?? [];
      if (!list.some(c => c.name === v.name && c.plate === v.plate)) {
        list.push({ name: v.name, plate: v.plate, vin: v.vin });
      }
      out.set(o.key, list);
    }
  }
  return out;
}

/**
 * Та же машина, что в записи? Сначала id гаража (он точный), иначе общий
 * ключ. Ключа нет — «не та же»: иначе все записи без машины слиплись бы в
 * одну и мастер увидел бы на приёмке чужую историю.
 */
export function sameVehicle(a: StoBookingRow, b: StoBookingRow): boolean {
  if (a.vehicle_id != null && a.vehicle_id === b.vehicle_id) return true;
  return sameSnapshot(a.data.vehicle, b.data.vehicle);
}

/**
 * Та же машина по снимкам записи. ПОРЯДОК ВАЖЕН: если VIN назван у обеих —
 * решает он, и совпадение номеров его не перебивает (табличку перевесили на
 * другую машину — это разные машины). Назван у одной или ни у одной —
 * сравниваем по общему ключу, то есть по номеру, иначе по марке и году.
 */
export function sameSnapshot(
  a: StoBookingVehicleSnapshot | undefined,
  b: StoBookingVehicleSnapshot | undefined,
): boolean {
  const va = vehicleVin(a), vb = vehicleVin(b);
  if (va && vb) return va === vb;
  const key = vehicleKey(a);
  return key !== null && key === vehicleKey(b);
}

/** Прошлое машины к моменту записи — то, что показывают мастеру на приёмке. */
export type VehiclePast = {
  /** Ключ машины; null — машины в записи нет и показывать нечего. */
  key: string | null;
  /**
   * Машина без номера: ключ склеен из марки, модели и года. Две «Лады Весты
   * 2021» разных клиентов дали бы общую историю, поэтому такую историю берём
   * только внутри одного клиента и подписываем оговоркой.
   */
  byName: boolean;
  /** Прошлые состоявшиеся визиты, свежие сверху. */
  visits: StoBookingRow[];
  /** Сколько раз машину уже обслуживали (выполненные визиты до этой записи). */
  done: number;
  /** Прежние владельцы — машину продают, и мастеру полезно это видеть. */
  otherOwners: VehicleOwner[];
};

const EMPTY_PAST: VehiclePast = { key: null, byName: false, visits: [], done: 0, otherOwners: [] };

/**
 * Что этой машине у нас уже делали — к моменту записи b.
 *
 * Считаем честно: только визиты ДО этой записи (будущие не «прошлое»), без
 * отменённых и неявок (машина не приезжала — работы не было), саму запись
 * исключаем. «Сколько раз была» — по выполненным: подтверждённая, но ещё не
 * закрытая запись — это не визит, а обещание.
 */
export function vehiclePast(rows: readonly StoBookingRow[], b: StoBookingRow, limit = 5): VehiclePast {
  const key = vehicleKey(b.data.vehicle);
  if (!key) return EMPTY_PAST;
  const vin = vehicleVin(b.data.vehicle);
  // Ключ склеен по марке и году — машину узнаём ненадёжно. Но если в записи
  // есть VIN, догадки не нужны: он один на весь мир, и история берётся по
  // нему даже у машины без номера.
  const byName = key.startsWith("m") && !vin;
  const mine = clientKey(b);
  const past = rows
    .filter(r => r.id !== b.id
      && r.starts_at < b.starts_at
      && (isLive(r) || r.status === "done")
      && sameSnapshot(b.data.vehicle, r.data.vehicle)
      // Без номера и без VIN машину узнаём только у того же клиента — чужую
      // «Весту 2021» выдавать за эту нельзя.
      && (!byName || clientKey(r) === mine))
    .sort((a, c) => c.starts_at.localeCompare(a.starts_at));
  const owners = new Map<string, VehicleOwner>();
  for (const r of past) {
    const o = ownerOf(r);
    if (o.key === mine || owners.has(o.key)) continue;
    owners.set(o.key, o);
  }
  return {
    key,
    byName,
    visits: past.slice(0, Math.max(0, limit)),
    done: past.filter(r => r.status === "done").length,
    otherOwners: [...owners.values()],
  };
}
