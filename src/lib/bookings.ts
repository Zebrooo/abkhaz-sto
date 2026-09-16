import "server-only";
import { cache } from "react";
// Записи сервиса: чтение и переходы под сервисным ключом ПОСЛЕ проверки
// места в сервисе (accessibleServiceShop). Переходы — оптимистично по текущему статусу:
// update ... where id and shop_id and status = <текущий>; две вкладки,
// нажавшие разное одновременно, не затрут друг друга молча.
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifySite } from "@/lib/site-events";
import type { StoBookingRow, StoBookingService, StoBookingData } from "@/lib/sto/types";
import { canReschedule, shopTransitionPatch, type StoTransition } from "@/lib/sto/transitions";
import { isSlotFree, localTime, type BusyInterval } from "@/lib/sto/slots";
import { addDays } from "@/lib/format";
import type { StoSchedule } from "@/lib/sto/schedule";

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
export async function countPending(shopId: number): Promise<number> {
  const { count, error } = await createSupabaseAdmin().from("sto_bookings")
    .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "new");
  if (error) {
    console.error("[сто] счётчик новых записей не прочитался:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Все записи сервиса, новые сверху — для клиентов и ленты уведомлений. */
export async function recentBookings(shopId: number, limit = 1000): Promise<StoBookingRow[]> {
  const { data, error } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).order("starts_at", { ascending: false }).limit(limit).returns<StoBookingRow[]>();
  if (error) {
    console.error("[сто] история записей не прочиталась:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getBooking(shopId: number, id: number): Promise<StoBookingRow | null> {
  const { data } = await createSupabaseAdmin().from("sto_bookings").select(COLUMNS)
    .eq("shop_id", shopId).eq("id", id).maybeSingle<StoBookingRow>();
  return data ?? null;
}

/** Занятые интервалы — живые записи сервиса за период (для окон и переноса). */
export async function busyIntervals(shopId: number, from: Date, to: Date, exceptId?: number): Promise<BusyInterval[]> {
  const rows = await listBookings(shopId, from, to);
  return rows
    .filter(b => canReschedule(b.status) && b.id !== exceptId)
    .map(b => ({ postNo: b.post_no, startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) }));
}

export type ActionResult = { ok: true } | { ok: false; error: string };

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
  await notifySite({ bookingId, shopId, event, actorUserId, details: input.reason ? { reason: input.reason } : undefined });
  return { ok: true };
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
  await notifySite({ bookingId, shopId, event: "rescheduled", actorUserId, details: { startsAt: startsAt.toISOString() } });
  return { ok: true };
}

/** Ручная запись клиента с улицы из приложения: без учётки, имя и телефон снимком. */
export async function createManualBooking(input: {
  shopId: number; schedule: StoSchedule; day: string; hhmm: string; service: StoBookingService; listingId: number | null;
  client: { name: string; phone: string | null }; vehicle: string; comment: string; actorUserId: string;
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
  const data: StoBookingData = {
    client: { name: client.name, phone: client.phone },
    ...(input.vehicle.trim() ? { vehicle: { brand: input.vehicle.trim().slice(0, 80), model: null, year: null, plate: null } } : {}),
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
  await notifySite({ bookingId: row.id, shopId, event: "created", actorUserId });
  return { ok: true, id: row.id };
}
