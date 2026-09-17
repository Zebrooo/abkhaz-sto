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
import { foldLookalike, normalizeVin, plateInput } from "@/lib/vehicle-input";

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
  // Проверка формы та же, что у ввода (lib/vehicle-input.ts): в старых
  // записях в поле машины попадало всякое, и склеивать машины по строке
  // «привезёт вечером» нельзя — она стала бы ключом карточки.
  const s = plateInput(raw);
  return s === null ? null : foldLookalike(s.replace(/[\s-]+/g, ""));
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
 * Признаки, по которым две записи считаются одной машиной, в порядке силы:
 * VIN (`v…`) → госномер (`p…`) → марка-модель-год (`m…`).
 *
 * Марка и год — признак СЛАБЫЙ и годится только тогда, когда ни VIN, ни
 * номера нет: иначе две «Лады Весты 2021» с разными номерами слиплись бы в
 * одну карточку. Поэтому он и не добавляется к сильным, а заменяет их.
 */
function vehicleIds(v: StoBookingVehicleSnapshot | undefined): string[] {
  if (!v) return [];
  const vin = vehicleVin(v);
  const plate = normalizePlate(v.plate);
  const name = vehicleName(v).toLowerCase();
  const weak = name === "машина" ? [] : [`m${encodeURIComponent(name)}`];
  if (plate) return [...(vin ? [`v${vin}`] : []), `p${plate}`];
  // НОМЕРА НЕТ — слабый признак остаётся в строю даже при VIN. Иначе визит,
  // в котором VIN вписали впервые, оторвался бы от всей прошлой истории
  // машины: раньше её узнавали по марке и году, и других зацепок нет.
  return [...(vin ? [`v${vin}`] : []), ...weak];
}

/**
 * Ключ машины для адреса /mashiny/<key>: VIN, иначе госномер, иначе
 * марка-модель-год. null — в записи машины вовсе нет (клиент приехал «на
 * посмотреть»), и карточке взяться неоткуда.
 *
 * Ключ по VIN даёт машине один адрес на всю жизнь: сменили номер — карточка
 * та же. А старый адрес по номеру продолжает открываться: карточка ищется по
 * ЛЮБОМУ признаку машины, а не только по каноническому (vehicleCard).
 */
export function vehicleKey(v: StoBookingVehicleSnapshot | undefined): string | null {
  return vehicleIds(v)[0] ?? null;
}

function ownerOf(b: StoBookingRow): VehicleOwner {
  return {
    key: clientKey(b),
    name: b.data.client?.name?.trim() || (b.client_id ? "Клиент с сайта" : "Клиент"),
    phone: normalizePhone(b.data.client?.phone) ?? null,
    lastAt: b.starts_at,
  };
}

/**
 * Записи одной машины в одной группе. Объединяем по ЛЮБОМУ общему признаку:
 * приехал в мае с номером, в сентябре — с тем же номером и уже с VIN, в
 * декабре — с новым номером и тем же VIN. Это три записи одной машины, и
 * карточка обязана быть одна.
 *
 * Поэтому группы не «ключ → строки», а объединение множеств: новая запись
 * склеивает группы, в которых нашёлся хоть один её признак.
 */
type VehicleGroup = { ids: Set<string>; rows: StoBookingRow[] };

function groupVehicles(rows: readonly StoBookingRow[]): VehicleGroup[] {
  const groups: VehicleGroup[] = [];
  const byId = new Map<string, VehicleGroup>();
  // СВЕЖИЕ ПЕРВЫМИ, и не ради скорости. Когда один номер побывал на двух
  // машинах (табличку перевесили), запись без VIN может подойти обеим — и
  // достаётся той группе, что заняла номер раньше по ходу обхода. Сортировка
  // делает этот выбор однозначным и осмысленным: такая запись уходит к
  // машине, которая носит номер СЕЙЧАС, а не к той, что носила его когда-то.
  for (const b of [...rows].sort((a, c) => c.starts_at.localeCompare(a.starts_at))) {
    const ids = vehicleIds(b.data.vehicle);
    if (ids.length === 0) continue;
    const vin = vehicleVin(b.data.vehicle);
    // VIN СИЛЬНЕЕ НОМЕРА И ЗДЕСЬ. Табличку перевешивают: один номер с двумя
    // разными VIN — это две машины, и сливать их по совпавшему номеру нельзя.
    const hit = [...new Set(ids.map(id => byId.get(id)).filter((g): g is VehicleGroup => !!g))]
      .filter(g => {
        if (!vin) return true;
        const theirs = [...g.ids].find(id => id.startsWith("v"));
        return !theirs || theirs === `v${vin}`;
      });
    let group: VehicleGroup;
    if (hit.length === 0) {
      group = { ids: new Set(), rows: [] };
      groups.push(group);
    } else {
      // Нашлось несколько групп — эта запись доказала, что они про одну
      // машину: сливаем их в первую, остальные выбрасываем.
      group = hit[0];
      for (const other of hit.slice(1)) {
        for (const id of other.ids) { group.ids.add(id); byId.set(id, group); }
        group.rows.push(...other.rows);
        groups.splice(groups.indexOf(other), 1);
      }
    }
    for (const id of ids) { group.ids.add(id); byId.set(id, group); }
    group.rows.push(b);
  }
  return groups;
}

/** Канонический ключ группы: VIN сильнее номера, номер сильнее марки. */
function groupKey(g: VehicleGroup): string | null {
  const ids = [...g.ids];
  return ids.find(id => id.startsWith("v")) ?? ids.find(id => id.startsWith("p")) ?? ids[0] ?? null;
}

/** Свод машин по записям, свежие визиты сверху. */
export function summarizeVehicles(rows: readonly StoBookingRow[]): VehicleSummary[] {
  return groupVehicles(rows).map(summarizeGroup).filter((v): v is VehicleSummary => v !== null)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function summarizeGroup(g: VehicleGroup): VehicleSummary | null {
  const key = groupKey(g);
  if (!key) return null;
  let sum: VehicleSummary | null = null;
  for (const b of g.rows) {
    const v = b.data.vehicle;
    if (!v) continue;
    const spent = b.status === "done" ? (b.service.price ?? 0) : 0;
    const owner = ownerOf(b);
    if (!sum) {
      sum = {
        key, name: vehicleName(v), plate: normalizePlate(v.plate), vin: vehicleVin(v), year: v.year ?? null,
        visits: 1, lastAt: b.starts_at, spent, owners: [owner],
      };
    } else {
      sum.visits += 1;
      sum.spent += spent;
      // Записи приходят свежими сверху, но функция чистая — сравниваем честно.
      // Номер берём у самой свежей записи, где он есть: перебили табличку —
      // в карточке должен стоять сегодняшний номер, а не первый попавшийся.
      if (b.starts_at > sum.lastAt) {
        sum.lastAt = b.starts_at;
        sum.name = vehicleName(v);
        sum.year = v.year ?? sum.year;
        sum.plate = normalizePlate(v.plate) ?? sum.plate;
        sum.vin = vehicleVin(v) ?? sum.vin;
      } else {
        sum.plate = sum.plate ?? normalizePlate(v.plate);
        sum.vin = sum.vin ?? vehicleVin(v);
      }
      const known = sum.owners.find(o => o.key === owner.key);
      if (!known) sum.owners.push(owner);
      else if (owner.lastAt > known.lastAt) known.lastAt = owner.lastAt;
    }
  }
  if (!sum) return null;
  sum.owners.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return sum;
}

/**
 * Карточка одной машины: чья она, что делали и когда. Ключ ищем среди ВСЕХ
 * признаков группы, а не только среди канонических: старая ссылка по номеру
 * обязана открывать ту же карточку после того, как у машины появился VIN.
 */
export function vehicleCard(rows: readonly StoBookingRow[], key: string): VehicleCard | null {
  const groups = groupVehicles(rows);
  // Сначала группа, для которой этот ключ КАНОНИЧЕСКИЙ, и только потом любая,
  // где он встречается как признак: один номер может остаться в двух группах
  // (табличку перевесили на другую машину), и открывать наугад нельзя.
  const group = groups.find(g => groupKey(g) === key) ?? groups.find(g => g.ids.has(key));
  if (!group) return null;
  const summary = summarizeGroup(group);
  if (!summary) return null;
  return { ...summary, history: [...group.rows].sort((a, b) => b.starts_at.localeCompare(a.starts_at)) };
}

/** Машины одного клиента — свежие сверху; ими же заполняется форма записи. */
export function clientVehicles(rows: readonly StoBookingRow[], key: string): VehicleSummary[] {
  return summarizeVehicles(rows.filter(b => clientKey(b) === key));
}

/** Машина клиента для формы записи: ключ карточки и всё, что подставляется в поля. */
export type ClientCar = { key: string; name: string; plate: string | null; vin: string | null };

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
      if (!list.some(c => c.key === v.key)) {
        list.push({ key: v.key, name: v.name, plate: v.plate, vin: v.vin });
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
  const ids = new Set(vehicleIds(a));
  return ids.size > 0 && vehicleIds(b).some(id => ids.has(id));
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
  const plate = normalizePlate(b.data.vehicle?.plate);
  const mine = clientKey(b);
  // ЧУЖУЮ ИСТОРИЮ БЕРЁМ ТОЛЬКО ПО СИЛЬНОМУ ПРИЗНАКУ — совпал VIN или номер.
  // Совпадение по марке и году — догадка: «Веста 2021» в городе не одна, и
  // такую историю показываем лишь внутри одного клиента. Машину продали и
  // новый хозяин приехал на ней же — сработает номер или VIN, как и должно.
  const strong = (r: StoBookingRow) => {
    const rv = vehicleVin(r.data.vehicle);
    if (vin && rv) return rv === vin;
    return plate !== null && normalizePlate(r.data.vehicle?.plate) === plate;
  };
  const past = rows
    .filter(r => r.id !== b.id
      && r.starts_at < b.starts_at
      && (isLive(r) || r.status === "done")
      && sameSnapshot(b.data.vehicle, r.data.vehicle)
      && (strong(r) || clientKey(r) === mine))
    .sort((a, c) => c.starts_at.localeCompare(a.starts_at));
  const owners = new Map<string, VehicleOwner>();
  for (const r of past) {
    const o = ownerOf(r);
    if (o.key === mine || owners.has(o.key)) continue;
    owners.set(o.key, o);
  }
  return {
    key,
    byName: key.startsWith("m"),
    visits: past.slice(0, Math.max(0, limit)),
    done: past.filter(r => r.status === "done").length,
    otherOwners: [...owners.values()],
  };
}
