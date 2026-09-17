import "server-only";
// Досье машины к моменту приёмки: что это за машина, была ли она у нас, что
// ей делали, какой был пробег и что тогда нашли. Один поход на запрос
// (cache), как master-day.ts — за досье приходят и «Мой пост», и осмотр.
//
// ЧТО ОТКУДА. Записи сервиса — свои, из общей базы: марка, номер, клиент,
// прошлые визиты и работы считаются из них без единого похода на сайт
// (lib/vehicles.ts). Пробег и найденные дефекты живут в осмотрах, а осмотры —
// на сайте, поэтому за ними идём точечно и не больше чем за тремя прошлыми
// визитами: экран открывают у машины с телефона, и каждый вызов — до трёх
// секунд ожидания. Гараж (актуальные машины клиента) — тоже сайт.
//
// ЧЕСТНОСТЬ ВАЖНЕЕ ПОЛНОТЫ. Сайт не ответил — так и пишем, а не «машина у нас
// впервые»: мастер поверит и не спросит того, что стоило спросить. Машины в
// записи нет — досье не собираем и в сеть не ходим вовсе. Машина без номера
// узнаётся только по марке и году, поэтому её историю берём лишь у того же
// клиента, а пробег и дефекты по ней не показываем совсем: чужой пробег в
// отчёте хуже, чем отсутствие подсказки.
import { cache } from "react";
import { fetchInspection, type Severity } from "@/lib/api/inspections";
import { fetchGarage, type StoGarageCar } from "@/lib/api/garage";
import { recentBookings } from "@/lib/bookings";
import type { ServiceContext } from "@/lib/context";
import { localDay } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";
import { normalizePlate, vehiclePast, type VehiclePast } from "@/lib/vehicles";

/** Замечание прошлого визита — строка «в прошлый раз нашли». */
export type PastDefect = { day: string; title: string; severity: Severity };

export type CarBrief = {
  past: VehiclePast;
  /** Пробег последнего осмотра этой машины. */
  prevKm: { day: string; km: number } | null;
  prevDefects: PastDefect[];
  /** Эта же машина в гараже клиента — VIN и актуальный номер. */
  garage: StoGarageCar | null;
  /** Сайт не ответил: пробег и замечания могли быть, а мы их не знаем. */
  siteDown: boolean;
};

/** За сколькими прошлыми осмотрами ходим: экран открывают у подъёмника, ждать некогда. */
const LOOK_BACK = 3;
/** Замечаний из прошлого — горсть: это подсказка, а не отчёт. */
const MAX_DEFECTS = 5;

const EMPTY: CarBrief = {
  past: { key: null, byName: false, visits: [], done: 0, otherOwners: [] },
  prevKm: null, prevDefects: [], garage: null, siteDown: false,
};

export const carBrief = cache(async (ctx: ServiceContext, b: StoBookingRow): Promise<CarBrief> => {
  const rows = await recentBookings(ctx.shop.id);
  const past = vehiclePast(rows, b, 5);
  if (!past.key) return EMPTY;

  const actor = { shopId: ctx.shop.id, actorUserId: ctx.userId };
  // Пробег и дефекты — только у машины с номером: склеенную по марке и году
  // легко перепутать с чужой такой же.
  const lookBack = past.byName ? [] : past.visits.slice(0, LOOK_BACK);
  const [inspections, garageRes] = await Promise.all([
    Promise.all(lookBack.map(r => fetchInspection({ ...actor, bookingId: r.id }))),
    fetchGarage({ ...actor, clientUserId: b.client_id, phone: b.data.client?.phone ?? null }),
  ]);

  let prevKm: CarBrief["prevKm"] = null;
  const prevDefects: PastDefect[] = [];
  let siteDown = !garageRes.ok && garageRes.code !== "not_found";
  for (const [i, res] of inspections.entries()) {
    if (!res.ok) {
      // «Осмотра не было» — обычное дело; всё остальное значит, что мы просто
      // не дозвонились до сайта, и молчать об этом нельзя.
      if (res.code !== "not_found") siteDown = true;
      continue;
    }
    const day = localDay(new Date(lookBack[i].starts_at));
    if (!prevKm) prevKm = { day, km: res.data.odometerKm };
    for (const d of res.data.defects) {
      if (prevDefects.length >= MAX_DEFECTS) break;
      prevDefects.push({ day, title: d.title, severity: d.severity });
    }
  }

  // Машина из гаража — только та же самая: по id из записи или по номеру.
  // «Основная» и совпадение по названию не годятся: у человека две Весты.
  const plate = normalizePlate(b.data.vehicle?.plate);
  const garage = garageRes.ok
    ? (garageRes.data.find(g => (b.vehicle_id != null && g.id === b.vehicle_id) || (plate !== null && normalizePlate(g.plate) === plate)) ?? null)
    : null;

  return { past, prevKm, prevDefects, garage, siteDown };
});
