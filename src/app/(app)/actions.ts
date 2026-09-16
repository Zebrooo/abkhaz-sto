"use server";
// Серверные действия экранов. Каждое: пользователь → его сервис (владение)
// → библиотека → revalidate → назад на экран с итогом в адресе (?ok= / ?err=).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { accessibleServiceShop } from "@/lib/shop";
import { roleIn } from "@/lib/context";
import { can, HOME_PATH, type Section } from "@/lib/access";
import { createManualBooking, rescheduleBooking, transitionBooking } from "@/lib/bookings";
import { listServices, toBookingService, updateService } from "@/lib/services";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  validateStoPrepay, validateStoSchedule, STO_DAYS, MAX_STO_INTERVALS_PER_DAY,
  type StoDay, type StoInterval,
} from "@/lib/sto/schedule";
import type { StoTransition } from "@/lib/sto/transitions";
import { normalizePhone } from "@/lib/phone";
import { linkItemBooking } from "@/lib/api/reports";

/** Назад на экран: запрос адреса возврата сохраняем, свой итог дописываем вместо прошлых ok/err. */
function back(path: string, q: Record<string, string | undefined>): never {
  const i = path.indexOf("?");
  const base = i === -1 ? path : path.slice(0, i);
  const sp = new URLSearchParams(i === -1 ? "" : path.slice(i + 1));
  sp.delete("ok");
  sp.delete("err");
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${base}?${s}` : base);
}

/** Адрес возврата из формы — только свой путь, без переезда на чужой сайт. */
function returnTo(fd: FormData, fallback: string): string {
  const raw = String(fd.get("return") ?? "").trim();
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

/**
 * Пользователь → его сервис → право на раздел. Сервис — хозяином или
 * сотрудником (accessibleServiceShop): мастер жмёт «Готово» в «Моём посте»,
 * и владения витриной у него нет. Раздел закрыт роли — на её первый экран,
 * как и у гейта страниц; настоящая граница — на сайте, здесь подсказка.
 */
async function ctx(fd: FormData, section: Section) {
  const user = await getServerUser();
  if (!user) redirect("/vhod");
  const shopId = Number(fd.get("shopId"));
  const shop = Number.isInteger(shopId) ? await accessibleServiceShop(shopId) : null;
  if (!shop) redirect("/");
  const { role } = roleIn(shop);
  if (!can(role, section)) redirect(HOME_PATH[role]);
  return { user, shop };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Экраны, которые показывают записи: после любого перехода обновляем все. */
function revalidateBookings() {
  revalidatePath("/");
  revalidatePath("/segodnya");
  revalidatePath("/kalendar");
  revalidatePath("/klienty");
  revalidatePath("/uvedomleniya");
}

export async function transitionAction(fd: FormData) {
  const { user, shop } = await ctx(fd, "bookings");
  const ret = returnTo(fd, "/segodnya");
  const t = str(fd, "transition") as StoTransition;
  if (!["confirm", "done", "no_show", "cancel"].includes(t)) back(ret, { err: "Неизвестное действие" });
  const bookingId = Number(str(fd, "bookingId"));
  const res = await transitionBooking({ shopId: shop.id, bookingId, transition: t, actorUserId: user.id, reason: str(fd, "reason") || undefined });
  revalidateBookings();
  revalidatePath(`/zapis/${bookingId}`);
  const done = ({ confirm: "Запись подтверждена — клиент получил пуш", done: "Готово. Предоплата ушла сервису", no_show: "Отмечено: клиент не приехал", cancel: "Запись отменена, клиент уведомлён" } as const)[t];
  back(ret, res.ok ? { ok: done } : { err: res.error });
}

export async function rescheduleAction(fd: FormData) {
  const { user, shop } = await ctx(fd, "bookings");
  const ret = returnTo(fd, "/kalendar");
  if (!shop.schedule) back(ret, { err: "Сначала задайте расписание" });
  const day = str(fd, "day");
  const res = await rescheduleBooking({ shopId: shop.id, bookingId: Number(str(fd, "bookingId")), schedule: shop.schedule, day, hhmm: str(fd, "hhmm"), actorUserId: user.id });
  revalidateBookings();
  if (!res.ok) back(ret, { err: res.error });
  back("/segodnya", { d: day, ok: "Запись перенесена — клиент уведомлён" });
}

export async function createManualAction(fd: FormData) {
  const { user, shop } = await ctx(fd, "bookings");
  const day = str(fd, "day");
  const listingId = Number(str(fd, "listingId"));
  const postRaw = Number(str(fd, "postNo"));
  const postNo = Number.isInteger(postRaw) && postRaw > 0 ? postRaw : undefined;
  const hhmm = str(fd, "hhmm");
  // Пришли из отчёта — пункт сметы и запись-источник тянем через все ошибки,
  // иначе повторная попытка потеряет связь.
  const fromInspection = Number(str(fd, "fromInspection")), fromDefect = Number(str(fd, "defect")), fromBooking = Number(str(fd, "fromBooking"));
  const fromReport = [fromInspection, fromDefect, fromBooking].every(n => Number.isInteger(n) && n > 0);
  const keep = {
    d: day, s: String(listingId), post: postNo ? String(postNo) : undefined, t: hhmm || undefined,
    ...(fromReport ? { fromInspection: String(fromInspection), defect: String(fromDefect), fromBooking: String(fromBooking) } : {}),
  };
  const ret = "/kalendar/novaya";
  if (!shop.schedule) back(ret, { ...keep, err: "Сначала задайте расписание" });
  const services = await listServices(shop.id);
  const svc = services.find(s => s.listingId === listingId);
  if (!svc) back(ret, { d: day, err: "Выберите услугу" });
  const name = str(fd, "name");
  if (!name) back(ret, { ...keep, step: "2", err: "Имя клиента обязательно" });
  const phoneRaw = str(fd, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) back(ret, { ...keep, step: "2", err: "Телефон не разобран — укажите в формате +7…" });
  if (!/^\d{2}:\d{2}$/.test(hhmm)) back(ret, { ...keep, step: "1", err: "Выберите время" });
  const res = await createManualBooking({
    shopId: shop.id, schedule: shop.schedule, day, hhmm, service: toBookingService(svc), listingId: svc.listingId,
    postNo, client: { name: name.slice(0, 80), phone }, vehicle: str(fd, "vehicle"), comment: str(fd, "comment"), actorUserId: user.id,
  });
  revalidateBookings();
  if (!res.ok) back(ret, { ...keep, step: "1", err: res.error });
  if (fromReport) {
    // Запись уже есть; связь с пунктом сметы — на сайте. Не связалось — запись
    // всё равно создана, и об этом честно в отчёте.
    const link = await linkItemBooking({ shopId: shop.id, actorUserId: user.id, inspectionId: fromInspection, defectId: fromDefect, bookingId: res.id });
    revalidatePath(`/zapis/${fromBooking}/otchet`);
    back(`/zapis/${fromBooking}/otchet`, link.ok
      ? { d: day, ok: `Записан: ${svc.title}, ${hhmm}` }
      : { d: day, err: `Запись создана, но к пункту отчёта не привязалась: ${link.error}` });
  }
  back("/segodnya", { d: day, ok: `Записан: ${svc.title}, ${hhmm}` });
}

/** Часы приёма одного дня: один интервал правится своей шторкой и сохраняется сразу. */
export async function saveIntervalAction(fd: FormData) {
  const { shop } = await ctx(fd, "schedule");
  const day = str(fd, "day") as StoDay;
  if (!STO_DAYS.includes(day)) back("/raspisanie", { err: "Неизвестный день" });
  const index = Number(str(fd, "index"));
  const remove = str(fd, "remove") === "1";
  const days: Record<string, StoInterval[]> = {};
  for (const d of STO_DAYS) days[d] = [...(shop.schedule?.days[d] ?? [])];
  const list = days[day];
  if (remove) {
    if (index < 0 || index >= list.length) back("/raspisanie", { err: "Такого интервала нет" });
    list.splice(index, 1);
  } else {
    const iv = { from: str(fd, "from"), to: str(fd, "to") };
    if (index >= 0 && index < list.length) list[index] = iv;
    else if (list.length >= MAX_STO_INTERVALS_PER_DAY) back("/raspisanie", { err: `Интервалов в дне — не больше ${MAX_STO_INTERVALS_PER_DAY}` });
    else list.push(iv);
  }
  const v = validateStoSchedule({
    days,
    posts: shop.schedule?.posts ?? 1,
    stepMin: shop.schedule?.stepMin ?? 30,
    bufferMin: shop.schedule?.bufferMin,
    daysOff: shop.schedule?.daysOff ?? [],
  });
  if (!v.ok) back("/raspisanie", { err: v.error });
  const { error } = await createSupabaseAdmin().from("shops").update({ sto_schedule: v.schedule }).eq("id", shop.id);
  if (error) back("/raspisanie", { err: "Не удалось сохранить: " + error.message });
  revalidatePath("/", "layout");
  back("/raspisanie", { ok: remove ? "Интервал убран" : "Часы приёма сохранены" });
}

/** Посты, шаг сетки, буфер, разовые выходные и предоплата — одной кнопкой снизу. */
export async function saveScheduleAction(fd: FormData) {
  const { shop } = await ctx(fd, "schedule");
  const days: Record<string, StoInterval[]> = {};
  for (const d of STO_DAYS) days[d] = [...(shop.schedule?.days[d] ?? [])];
  const daysOff = str(fd, "daysOff").split(/[\s,;]+/).filter(Boolean);
  // Буфер не передан (старая форма в открытой вкладке) — остаётся текущий, а не «Нет».
  const bufferMin = str(fd, "bufferMin") === "" ? shop.schedule?.bufferMin : Number(str(fd, "bufferMin"));
  const v = validateStoSchedule({ days, posts: Number(str(fd, "posts")), stepMin: Number(str(fd, "stepMin")), bufferMin, daysOff });
  if (!v.ok) back("/raspisanie", { err: v.error });
  const p = validateStoPrepay({
    mode: str(fd, "prepayMode"), amount: Number(str(fd, "prepayAmount")), percent: Number(str(fd, "prepayPercent")),
    freeCancelHours: str(fd, "freeCancelHours") === "" ? undefined : Number(str(fd, "freeCancelHours")),
  });
  if (!p.ok) back("/raspisanie", { err: p.error });
  const { error } = await createSupabaseAdmin().from("shops").update({ sto_schedule: v.schedule, sto_prepay: p.prepay }).eq("id", shop.id);
  if (error) back("/raspisanie", { err: "Не удалось сохранить: " + error.message });
  revalidatePath("/", "layout");
  back("/raspisanie", { ok: "Расписание сохранено" });
}

/** Разовый выходной: добавить дату или убрать её из списка. */
export async function toggleDayOffAction(fd: FormData) {
  const { shop } = await ctx(fd, "schedule");
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back("/raspisanie", { err: "Дата — в виде ГГГГ-ММ-ДД" });
  const current = shop.schedule?.daysOff ?? [];
  const daysOff = current.includes(date) ? current.filter(d => d !== date) : [...current, date];
  const days: Record<string, StoInterval[]> = {};
  for (const d of STO_DAYS) days[d] = [...(shop.schedule?.days[d] ?? [])];
  const v = validateStoSchedule({ days, posts: shop.schedule?.posts ?? 1, stepMin: shop.schedule?.stepMin ?? 30, bufferMin: shop.schedule?.bufferMin, daysOff });
  if (!v.ok) back("/raspisanie", { err: v.error });
  const { error } = await createSupabaseAdmin().from("shops").update({ sto_schedule: v.schedule }).eq("id", shop.id);
  if (error) back("/raspisanie", { err: "Не удалось сохранить: " + error.message });
  revalidatePath("/", "layout");
  back("/raspisanie", { ok: current.includes(date) ? "Дата убрана" : "Выходной добавлен" });
}

export async function saveServiceAction(fd: FormData) {
  const { shop } = await ctx(fd, "editServices");
  const priceRaw = str(fd, "price").replace(/\s/g, "");
  const res = await updateService(shop.id, Number(str(fd, "listingId")), {
    price: priceRaw === "" ? null : Number(priceRaw.replace(",", ".")),
    durationMin: Number(str(fd, "durationMin")),
    visible: fd.has("visible") ? str(fd, "visible") === "1" : undefined,
  });
  revalidatePath("/uslugi");
  revalidatePath("/kalendar/novaya");
  back("/uslugi", res.ok ? { ok: "Цена и длительность сохранены" } : { err: res.error });
}
