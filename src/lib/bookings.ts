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
import type { StoBookingExtra, StoBookingRow, StoBookingService, StoBookingClientSnapshot, StoBookingData } from "@/lib/sto/types";
import { canReschedule, shopTransitionPatch, type StoTransition } from "@/lib/sto/transitions";
import { planDelay } from "@/lib/delay";
import { firstFreePost, isSlotFree, localTime, type BusyInterval } from "@/lib/sto/slots";
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
 * VIN в запись — рукой администратора или автоподстановкой из истории
 * (lib/vin-history.ts; спека abkhaz-auto 2026-09-22-sto-booking-garage-vin).
 * Пишется в data.vehicle, дальше историю клеит существующий механизм
 * clients.vins. Если запись пришла с машиной из гаража сайта (vehicle_id) —
 * VIN уезжает и туда, но ТОЛЬКО в пустое поле: заполненное клиентом сервис
 * молча не перетирает. Ошибка гаража запись не роняет — VIN в записи уже
 * сохранён, а гараж догонит следующая правка.
 */
export async function setBookingVin(shopId: number, bookingId: number, vin: string): Promise<StoBookingRow | null> {
  const current = await getBooking(shopId, bookingId);
  if (!current) return null;
  const vehicle = { ...(current.data.vehicle ?? { brand: "", model: null, year: null, plate: null }), vin };
  const data = { ...current.data, vehicle };
  const { error } = await createSupabaseAdmin().from("sto_bookings")
    .update({ data }).eq("id", bookingId).eq("shop_id", shopId);
  if (error) {
    console.error("[сто] VIN записи не сохранился:", error.message);
    return null;
  }
  if (current.vehicle_id != null) {
    const { error: garageError } = await createSupabaseAdmin().from("user_vehicles")
      .update({ vin }).eq("id", current.vehicle_id).or("vin.is.null,vin.eq.");
    if (garageError) console.error("[сто] VIN в гараж клиента не дописался:", garageError.message);
  }
  return { ...current, data };
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

/** Сколько услуг можно навесить на одну запись сверх основной. */
const MAX_EXTRAS = 30;

/**
 * Услуга, добавленная по ходу работы: мастер нашёл на подъёмнике ещё работу,
 * и она должна попасть в запись и в деньги. Снимок цены — в data.extras;
 * время записи НЕ трогаем (решение владельца): для него «Нужно больше
 * времени». Сайту не сообщаем — клиент стоит рядом с мастером.
 */
export async function addBookingExtra(input: {
  shopId: number; bookingId: number; extra: Omit<StoBookingExtra, "at">;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { shopId, bookingId } = input;
  const current = await getBooking(shopId, bookingId);
  if (!current) return { ok: false, error: "Запись не найдена" };
  if (!canReschedule(current.status)) return { ok: false, error: "Дополнить можно только живую запись" };
  const extras = [...(current.data.extras ?? []), { ...input.extra, at: new Date().toISOString() }];
  if (extras.length > MAX_EXTRAS) return { ok: false, error: `Услуг в записи — не больше ${MAX_EXTRAS + 1}` };
  const { data: updated, error } = await createSupabaseAdmin().from("sto_bookings")
    .update({ data: { ...current.data, extras } })
    .eq("id", bookingId).eq("shop_id", shopId).eq("status", current.status)
    .select("id").returns<{ id: number }[]>();
  if (error) return { ok: false, error: "Не удалось сохранить: " + error.message };
  if (!updated || updated.length === 0) return { ok: false, error: "Запись уже изменили — обновите экран" };
  return { ok: true };
}

/**
 * «Мастер задерживается»: продлить запись на minutes и сдвинуть цепочку
 * идущих следом записей поста (план — lib/delay.ts). Сдвигаем С КОНЦА:
 * каждая едет в место, которое следующая уже освободила, и ограничение
 * пересечений в базе (23P01) не срабатывает на промежуточном состоянии.
 * Свою запись продлеваем последней — к этому моменту место за ней свободно.
 * Клиентам сдвинутых записей сайт шлёт уведомление о смещении (rescheduled
 * с details.delayMin — текст с извинениями собирает booking-notice сайта).
 */
export async function delayBooking(input: {
  shopId: number; bookingId: number; minutes: number; actorUserId: string;
}): Promise<{ ok: true; told: boolean; shifted: number } | { ok: false; error: string }> {
  const { shopId, bookingId, minutes, actorUserId } = input;
  const current = await getBooking(shopId, bookingId);
  if (!current) return { ok: false, error: "Запись не найдена" };
  // Окно плана: от начала записи до двух суток после её конца — длиннее
  // цепочка сдвига не бывает (услуга ≤ 8 часов, задержка ≤ часа).
  const rows = await listBookings(shopId, new Date(current.starts_at), new Date(new Date(current.ends_at).getTime() + 48 * 3_600_000));
  const plan = planDelay({ rows, bookingId, minutes });
  if (!plan.ok) return plan;

  const admin = createSupabaseAdmin();
  const at = new Date().toISOString();
  for (const s of [...plan.shifts].reverse()) {
    const history = [...(s.row.data.history ?? []), { at, from: s.row.starts_at, to: s.newStart.toISOString(), by: "shop" as const }];
    const { data: updated, error } = await admin.from("sto_bookings")
      .update({ starts_at: s.newStart.toISOString(), ends_at: s.newEnd.toISOString(), data: { ...s.row.data, history } })
      .eq("id", s.row.id).eq("shop_id", shopId).eq("status", s.row.status)
      .select("id").returns<{ id: number }[]>();
    if (error || !updated || updated.length === 0) {
      return { ok: false, error: "Сдвинуть записи следом не получилось — календарь только что изменили, обновите его и попробуйте ещё раз" };
    }
  }
  const delays = [...(current.data.delays ?? []), { at, minutes }];
  const { data: updated, error } = await admin.from("sto_bookings")
    .update({ ends_at: plan.endsAt.toISOString(), data: { ...current.data, delays } })
    .eq("id", bookingId).eq("shop_id", shopId).eq("status", current.status)
    .select("id").returns<{ id: number }[]>();
  if (error || !updated || updated.length === 0) {
    // Соседи уже сдвинуты — это не потеря, просто зазор; но правду говорим.
    return { ok: false, error: "Записи следом сдвинуты, а продлить эту не вышло — запись только что изменили, обновите экран" };
  }
  let told = true;
  for (const s of plan.shifts) {
    const ok = await notifySite({
      bookingId: s.row.id, shopId, event: "rescheduled", actorUserId,
      details: { startsAt: s.newStart.toISOString(), delayMin: s.shiftMin },
    });
    told = told && ok;
  }
  return { ok: true, told, shifted: plan.shifts.length };
}

/** Ручная запись клиента с улицы из приложения: без учётки, имя и телефон снимком. */
/**
 * Запись «с улицы» под осмотр: машина уже заехала на пост без записи, и
 * человек за стойкой не должен выбирать услугу и окно — реальность первична.
 * Поэтому расписание и «время прошло» НЕ проверяются (в отличие от
 * createManualBooking): запись ставится «сейчас», услуга — «Осмотр» с
 * договорной ценой (смету соберёт сам осмотр). Пост — свой (если свободен),
 * иначе первый свободный: пересечение записей на посту не пустит база (23P01).
 */
export async function createWalkInBooking(input: {
  shopId: number;
  schedule: StoSchedule | null;
  client: { name: string; phone: string | null };
  vehicle: string;
  plate?: string | null;
  vin?: string | null;
  /** Пост, где человек стоит; null — не отмечался. */
  preferredPost: number | null;
  actorUserId: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const now = new Date();
  const service: StoBookingService = { title: "Осмотр", price: null, currency: "RUB", durationMin: 60 };
  const endsAt = new Date(now.getTime() + service.durationMin * 60_000);
  const posts = input.schedule?.posts ?? 1;
  const busy = await busyIntervals(input.shopId, new Date(now.getTime() - 24 * 3_600_000), new Date(now.getTime() + 24 * 3_600_000));
  const clash = (p: number) => busy.some(b => b.postNo === p && b.startsAt < endsAt && b.endsAt > now);
  const postNo = input.preferredPost && input.preferredPost <= posts && !clash(input.preferredPost)
    ? input.preferredPost
    : firstFreePost(posts, busy, now, endsAt);
  if (postNo === null) return { ok: false, error: "Все посты заняты записями — освободите пост или перенесите запись" };

  const plate = plateInput(input.plate);
  const vin = normalizeVin(input.vin);
  const brand = input.vehicle.trim().slice(0, 80);
  const data: StoBookingData = {
    client: { name: input.client.name, phone: input.client.phone },
    ...(brand || plate || vin ? { vehicle: { brand, model: null, year: null, plate, vin } } : {}),
  };
  const { data: row, error } = await createSupabaseAdmin().from("sto_bookings").insert({
    shop_id: input.shopId, client_id: null, vehicle_id: null, listing_id: null, service,
    starts_at: now.toISOString(), ends_at: endsAt.toISOString(), post_no: postNo,
    // Машина уже на посту — подтверждать нечего.
    status: "confirmed", source: "app", data,
  }).select("id").single<{ id: number }>();
  if (error || !row) {
    return { ok: false, error: error?.code === "23P01" ? "Пост только что заняли — попробуйте ещё раз" : "Не удалось сохранить: " + (error?.message ?? "") };
  }
  // Как у createManualBooking: событие сайт обработает, когда дойдёт.
  void notifySite({ bookingId: row.id, shopId: input.shopId, event: "created", actorUserId: input.actorUserId })
    .catch(e => console.warn("[сто] событие создания записи не ушло на сайт:", e));
  return { ok: true, id: row.id };
}

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
