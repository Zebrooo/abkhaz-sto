import "server-only";
import { cache } from "react";
// Записи сервиса: чтение и переходы под сервисным ключом ПОСЛЕ проверки
// места в сервисе (accessibleServiceShop). Переходы — оптимистично по текущему статусу:
// update ... where id and shop_id and status = <текущий>; две вкладки,
// нажавшие разное одновременно, не затрут друг друга молча.
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifySite } from "@/lib/site-events";
import { clientKey, clientKeyOf } from "@/lib/clients";
import { vehicleKey, type VehiclePastRow } from "@/lib/vehicles";
import type { StoBookingRow, StoBookingService, StoBookingClientSnapshot, StoBookingData } from "@/lib/sto/types";
import { canReschedule, shopTransitionPatch, type StoTransition } from "@/lib/sto/transitions";
import { isSlotFree, localTime, type BusyInterval } from "@/lib/sto/slots";
import { addDays } from "@/lib/format";
import type { StoSchedule } from "@/lib/sto/schedule";
import { normalizeVin, plateInput } from "@/lib/vehicle-input";

const COLUMNS = "id, shop_id, client_id, vehicle_id, listing_id, service, starts_at, ends_at, post_no, status, cancelled_by, source, prepay_amount, prepay_status, data, created_at, updated_at";

/** Записи сервиса за период [from, to) — по времени и посту. */
export async function listBookings(shopId: number, from: Date, to: Date): Promise<StoBookingRow[]> {
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString())
    .order("starts_at").order("post_no").returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] записи не прочитались:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Записи одного дня — то, что спрашивают и оболочка (вкладка «Осмотр»), и
 * экран, и карточка записи. cache() склеивает их в один запрос на рендер:
 * listBookings с Date-аргументами так не склеить — у каждого вызова свои
 * объекты.
 */
export const dayBookings = cache((shopId: number, day: string): Promise<StoBookingRow[]> =>
  listBookings(shopId, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00")));

/** Сколько записей ждёт подтверждения — цифра на колоколе и в меню. */
export const countPending = cache(async (shopId: number): Promise<number> => {
  const { count, error } = await createSupabaseAdmin().from("sto_bookings")
    .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "new");
  if (error) {
    console.error("[сто] счётчик новых записей не прочитался:", error.message);
    return 0;
  }
  return count ?? 0;
});

/**
 * Все записи сервиса, новые сверху — для клиентов, машин и ленты
 * уведомлений. cache() на запрос: за одной и той же историей в одном рендере
 * приходят карточка записи, досье машины и свод клиентов, а это тысяча
 * строк со снимками — читать её трижды незачем. Ключ кэша — аргументы,
 * поэтому вызов с другим limit ходит в базу отдельно.
 */
export const recentBookings = cache(async (shopId: number, limit = 1000): Promise<StoBookingRow[]> => {
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).order("starts_at", { ascending: false }).limit(limit).returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] история записей не прочиталась:", error.message);
    return [];
  }
  return data ?? [];
});

export async function getBooking(shopId: number, id: number): Promise<StoBookingRow | null> {
  const { data } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).eq("id", id).maybeSingle<StoBookingRow>();
  return data ?? null;
}

/** Записи по списку id одним запросом — вместо N getBooking подряд (отчёт: «записан на работу»). */
export async function bookingsByIds(shopId: number, ids: number[]): Promise<StoBookingRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).in("id", ids).returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] записи по списку не прочитались:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Ключ клиента (clientKey, lib/clients.ts) в SQL повторяется только для
 * учётки: телефон нормализуется в JS (8 → +7, 10 цифр → +7), а имя кодируется —
 * postgrest этого не выразит. Поэтому для ключей «p» и «n» запрос режется
 * грубым предфильтром (телефон вообще есть / учётки нет), а точный отбор
 * делает тот же clientKey в JS — множество строк то же, что у recentBookings.
 * Ключ из адреса может прийти раскодированным — сравниваем оба вида, как
 * карточка клиента.
 */
function matchClientKey(rowKey: string, key: string): boolean {
  return rowKey === key || rowKey === encodeURIComponent(key);
}

/**
 * Нижняя граница клиентской истории. Предфильтр ключей «p» и «n» грубый
 * (телефон есть / учётки нет), и без окна он тянул бы все безучётковые строки
 * сервиса за всё время — тяжелее заменённого recentBookings(1000). Два года
 * покрывают живых клиентов: «N записей» и история карточки считаются в этом
 * окне, и клиент, не приезжавший дольше, честно выглядит новым — об этом
 * говорит и подпись возраста карточки. Для учётки окно то же, чтобы цифра не
 * зависела от способа склейки.
 */
const CLIENT_HISTORY_YEARS = 2;

function clientHistoryFrom(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - CLIENT_HISTORY_YEARS);
  return d.toISOString();
}

/** Сколько записей у клиента — цифра «N записей» в карточке записи. */
export async function countClientVisits(shopId: number, key: string): Promise<number> {
  // Учётка — точный фильтр, строки не нужны вовсе.
  if (key.startsWith("u")) {
    const { count, error } = await createSupabaseAdmin().from("sto_bookings")
      .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("client_id", key.slice(1))
      .gte("starts_at", clientHistoryFrom());
    if (error) {
      console.error("[сто] записи клиента не посчитались:", error.message);
      return 0;
    }
    return count ?? 0;
  }
  const base = createSupabaseAdmin().from("sto_bookings").select("id, client_id, data->client")
    .eq("shop_id", shopId).gte("starts_at", clientHistoryFrom());
  const q = key.startsWith("p") ? base.not("data->client->>phone", "is", null) : base.is("client_id", null);
  const { data, error } = await q.returns<{ id: number; client_id: string | null; client: StoBookingClientSnapshot | null }[]>();
  if (error) {
    console.error("[сто] записи клиента не посчитались:", error.message);
    return 0;
  }
  return (data ?? []).filter(r => matchClientKey(clientKeyOf(r.client_id, r.client), key)).length;
}

/** Записи одного клиента для его карточки, свежие сверху. */
export async function bookingsOfClient(shopId: number, key: string, limit = 200): Promise<StoBookingRow[]> {
  const base = createSupabaseAdmin().from("sto_bookings").select(COLUMNS).eq("shop_id", shopId)
    .gte("starts_at", clientHistoryFrom())
    .order("starts_at", { ascending: false });
  // По учётке фильтр точный — хватает и лимита в самом запросе; по телефону и
  // имени лимит ставить нельзя: предфильтр грубый, и он отрезал бы нужное.
  const q = key.startsWith("u") ? base.eq("client_id", key.slice(1)).limit(limit)
    : key.startsWith("p") ? base.not("data->client->>phone", "is", null)
      : base.is("client_id", null);
  const { data, error } = await q.returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] записи клиента не прочитались:", error.message);
    return [];
  }
  return (data ?? []).filter(b => matchClientKey(clientKey(b), key)).slice(0, limit);
}

/**
 * Лента уведомлений: только те записи, из которых buildFeed строит события
 * (lib/notifications.ts) — новые, отменённые клиентом и с зачисленной
 * предоплатой. Порядок по updated_at приблизительный: свежесть события для
 * новых записей — created_at, поэтому финальную сортировку делает buildFeed.
 */
export async function feedBookings(shopId: number, limit = 200): Promise<StoBookingRow[]> {
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId)
    .or("status.eq.new,and(status.eq.cancelled,cancelled_by.eq.client),and(prepay_status.eq.released_to_shop,prepay_amount.gt.0)")
    .order("updated_at", { ascending: false }).limit(limit).returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] лента уведомлений не прочиталась:", error.message);
    return [];
  }
  return data ?? [];
}

/** Колонки, которые читает vehiclePast, — целиком COLUMNS ради досье одной машины не тянем. */
const PAST_COLUMNS = "id, client_id, service, starts_at, status, data";

/**
 * Прошлые записи сервиса до b — кандидаты для досье машины на приёмке
 * (lib/car-brief.ts). Склейку «та же машина» делает vehiclePast в JS, и её
 * нормализацию (кириллица → латиница, без пробелов, верхний регистр) в SQL
 * НЕ повторить: снимок хранит написание человека, и сравнение сырого текста
 * молча теряло записи той же машины, набранные в другой раскладке. Поэтому
 * здесь — широкая, но лёгкая выборка-надмножество: только колонки
 * vehiclePast, свежие сверху, с верхней границей. Окно 200 — старое было
 * 1000 записей сервиса: в двухстах последних записях машина с историей
 * встретится почти всегда, а «обслуживали N раз» для неё может занизиться —
 * принятый компромисс ради приёмки без ожидания.
 */
export async function vehicleVisits(shopId: number, b: StoBookingRow, limit = 200): Promise<VehiclePastRow[]> {
  // Машины в записи нет — и досье не из чего собирать, в базу не ходим.
  if (!vehicleKey(b.data.vehicle)) return [];
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(PAST_COLUMNS)
    .eq("shop_id", shopId).lt("starts_at", b.starts_at)
    .order("starts_at", { ascending: false }).limit(limit).returns<VehiclePastRow[]>();
  if (error) {
    console.error("[сто] прошлые записи машины не прочитались:", error.message);
    return [];
  }
  return data ?? [];
}

/** Занятые интервалы — живые записи сервиса за период (для окон и переноса). */
export async function busyIntervals(shopId: number, from: Date, to: Date, exceptId?: number): Promise<BusyInterval[]> {
  const rows = await listBookings(shopId, from, to);
  return rows
    .filter(b => canReschedule(b.status) && b.id !== exceptId)
    .map(b => ({ postNo: b.post_no, startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) }));
}

/**
 * `told` — дошло ли событие до сайта. Пуш клиенту, Telegram и проводки
 * предоплаты делает сайт; если он молчит, запись в базе всё равно изменилась,
 * но обещать клиенту уведомление нельзя.
 */
export type ActionResult = { ok: true; told: boolean } | { ok: false; error: string };

/** Переход сервисом: подтвердить, выполнено, не приехал, отменить (с причиной). */
export async function transitionBooking(input: {
  shopId: number; bookingId: number; transition: StoTransition; actorUserId: string; reason?: string;
}): Promise<ActionResult> {
  const { shopId, bookingId, transition, actorUserId } = input;
  const current = await getBooking(shopId, bookingId);
  if (!current) return { ok: false, error: "Запись не найдена" };
  const patch = shopTransitionPatch(current.status, transition);
  if (!patch) return { ok: false, error: "Из этого статуса так нельзя" };
  const data: StoBookingData = { ...current.data };
  if (transition === "cancel" && input.reason?.trim()) data.cancelReason = input.reason.trim().slice(0, 300);
  const { data: updated, error } = await createSupabaseAdmin().from("sto_bookings")
    .update({ ...patch, data })
    .eq("id", bookingId).eq("shop_id", shopId).eq("status", current.status)
    .select("id").returns<{ id: number }[]>();
  if (error) return { ok: false, error: "Не удалось сохранить: " + error.message };
  if (!updated || updated.length === 0) return { ok: false, error: "Запись уже изменили — обновите экран" };
  const event = ({ confirm: "confirmed", done: "done", no_show: "no_show", cancel: "cancelled" } as const)[transition];
  const told = await notifySite({ bookingId, shopId, event, actorUserId, details: input.reason ? { reason: input.reason } : undefined });
  return { ok: true, told };
}

/**
 * Перенос живой записи на другое окно (и, возможно, пост). Пост задан —
 * ставим ровно на него (запись перетащили на колонку сетки), не задан —
 * сервер берёт первый свободный, как в списке окон.
 */
export async function rescheduleBooking(input: {
  shopId: number; bookingId: number; schedule: StoSchedule; day: string; hhmm: string; actorUserId: string; postNo?: number;
}): Promise<ActionResult> {
  const { shopId, bookingId, schedule, day, hhmm, actorUserId } = input;
  const current = await getBooking(shopId, bookingId);
  if (!current) return { ok: false, error: "Запись не найдена" };
  if (!canReschedule(current.status)) return { ok: false, error: "Перенести можно только живую запись" };
  const startsAt = localTime(day, hhmm);
  const durationMin = Math.max(1, Math.round((new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime()) / 60_000));
  const busy = await busyIntervals(shopId, new Date(startsAt.getTime() - 24 * 3_600_000), new Date(startsAt.getTime() + 24 * 3_600_000), bookingId);
  const free = isSlotFree({ schedule, startsAt, durationMin, busy, postNo: input.postNo });
  if (!free.ok) {
    const why = { closed: "В это время сервис не работает", past: "Это время уже прошло", no_post: "Такого поста у сервиса нет", taken: "Окно уже занято" } as const;
    return { ok: false, error: why[free.reason] };
  }
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  const history = [...(current.data.history ?? []), { at: new Date().toISOString(), from: current.starts_at, to: startsAt.toISOString(), by: "shop" as const }];
  const { data: updated, error } = await createSupabaseAdmin().from("sto_bookings")
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), post_no: free.postNo, data: { ...current.data, history } })
    .eq("id", bookingId).eq("shop_id", shopId).eq("status", current.status)
    .select("id").returns<{ id: number }[]>();
  if (error) {
    // 23P01 — ограничение исключения: окно заняли между проверкой и записью.
    return { ok: false, error: error.code === "23P01" ? "Окно только что заняли — выберите другое" : "Не удалось сохранить: " + error.message };
  }
  if (!updated || updated.length === 0) return { ok: false, error: "Запись уже изменили — обновите экран" };
  const told = await notifySite({ bookingId, shopId, event: "rescheduled", actorUserId, details: { startsAt: startsAt.toISOString() } });
  return { ok: true, told };
}

/** Ручная запись клиента с улицы из приложения: без учётки, имя и телефон снимком. */
export async function createManualBooking(input: {
  shopId: number; schedule: StoSchedule; day: string; hhmm: string; service: StoBookingService; listingId: number | null;
  client: { name: string; phone: string | null }; vehicle: string; comment: string; actorUserId: string;
  /** Госномер и VIN отдельными полями: по ним машина потом узнаётся. */
  plate?: string | null; vin?: string | null;
  /** Пост выбран человеком; без него — первый свободный. */
  postNo?: number;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const { shopId, schedule, day, hhmm, service, listingId, client, actorUserId } = input;
  const startsAt = localTime(day, hhmm);
  const busy = await busyIntervals(shopId, new Date(startsAt.getTime() - 24 * 3_600_000), new Date(startsAt.getTime() + 24 * 3_600_000));
  const free = isSlotFree({ schedule, startsAt, durationMin: service.durationMin, busy, postNo: input.postNo });
  if (!free.ok) {
    const why = { closed: "В это время сервис не работает", past: "Это время уже прошло", no_post: "Такого поста у сервиса нет", taken: "Окно уже занято" } as const;
    return { ok: false, error: why[free.reason] };
  }
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
  // Марка, модель и год так и остаются одной строкой в brand: разбирать её
  // догадками нельзя — старые записи от этого расклеятся по разным карточкам.
  // А номер и VIN спрашиваются отдельными полями, и по ним машина узнаётся
  // точно (lib/vehicles.ts).
  const plate = plateInput(input.plate);
  const vin = normalizeVin(input.vin);
  const brand = input.vehicle.trim().slice(0, 80);
  const data: StoBookingData = {
    client: { name: client.name, phone: client.phone },
    ...(brand || plate || vin ? { vehicle: { brand, model: null, year: null, plate, vin } } : {}),
    ...(input.comment.trim() ? { comment: input.comment.trim().slice(0, 500) } : {}),
  };
  const { data: row, error } = await createSupabaseAdmin().from("sto_bookings").insert({
    shop_id: shopId, client_id: null, vehicle_id: null, listing_id: listingId, service,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), post_no: free.postNo,
    // Сервис записал сам — подтверждать нечего.
    status: "confirmed", source: "app", data,
  }).select("id").single<{ id: number }>();
  if (error || !row) {
    return { ok: false, error: error?.code === "23P01" ? "Окно только что заняли — выберите другое" : "Не удалось сохранить: " + (error?.message ?? "") };
  }
  // Ответ не ждёт сайт: запись уже в базе, а событие сайт обработает, когда
  // дойдёт, — ровно как при молчащем сайте (site-events.ts). В переходах
  // ждём, потому что экран говорит «клиент уведомлён» только по правде; здесь
  // такого обещания нет.
  void notifySite({ bookingId: row.id, shopId, event: "created", actorUserId })
    .catch(e => console.warn("[сто] событие создания записи не ушло на сайт:", e));
  return { ok: true, id: row.id };
}
