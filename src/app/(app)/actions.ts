"use server";
// Серверные действия экранов. Каждое: пользователь → его сервис (владение)
// → библиотека → revalidate → назад на экран с итогом в адресе (?ok= / ?err=).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { accessibleServiceShop } from "@/lib/shop";
import { blockIfViewing, roleIn } from "@/lib/context";
import { readRoleView } from "@/lib/role-cookie";
import { narrowRole } from "@/lib/role-view";
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
import { plateProblem, vinProblem } from "@/lib/vehicle-input";
import { linkItemBooking } from "@/lib/api/reports";

/**
 * Назад на экран: запрос адреса возврата сохраняем, свой итог дописываем
 * вместо прошлых ok/err. null в значении — «убрать этот параметр»: после
 * переноса экран не должен вернуться в режим переноса.
 */
function back(path: string, q: Record<string, string | undefined | null>): never {
  const i = path.indexOf("?");
  const base = i === -1 ? path : path.slice(0, i);
  const sp = new URLSearchParams(i === -1 ? "" : path.slice(i + 1));
  sp.delete("ok");
  sp.delete("err");
  for (const [k, v] of Object.entries(q)) {
    if (v === null) sp.delete(k);
    else if (v) sp.set(k, v);
  }
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
  // Примерка роли действует и здесь: хозяин, который смотрит глазами
  // мастера, не должен получить админское действие в обход интерфейса —
  // иначе кнопка и действие разъедутся (lib/role-view.ts).
  const { role: realRole } = roleIn(shop);
  const role = narrowRole(realRole, await readRoleView({ shopId: shop.id, userId: user.id }));
  // В примерке роли ничего не меняем: сайт всё равно решает по настоящему
  // actorUserId, и действие вышло бы не тем, что обещает кнопка.
  blockIfViewing({ viewing: role !== realRole });
  if (!can(role, section)) redirect(HOME_PATH[role]);
  return { user, shop, role };
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
  const { user, shop, role } = await ctx(fd, "bookings");
  const ret = returnTo(fd, "/segodnya");
  const t = str(fd, "transition") as StoTransition;
  if (!["confirm", "done", "no_show", "cancel"].includes(t)) back(ret, { err: "Неизвестное действие" });
  // Кнопки мастеру не показываем, но проверка нужна и здесь: экран — не
  // граница, адрес действия можно позвать и мимо него.
  if ((t === "cancel" || t === "no_show") && !can(role, "closeBooking")) {
    back(ret, { err: "Отменить запись и отметить неявку может админ или хозяин" });
  }
  const bookingId = Number(str(fd, "bookingId"));
  const res = await transitionBooking({ shopId: shop.id, bookingId, transition: t, actorUserId: user.id, reason: str(fd, "reason") || undefined });
  revalidateBookings();
  revalidatePath(`/zapis/${bookingId}`);
  // ЧЕСТНО ПРО УВЕДОМЛЕНИЕ. Пуш, Telegram и предоплату делает сайт; молчит
  // он — админ должен это понять и позвонить клиенту сам, а не прочитать
  // «клиент уведомлён» и успокоиться.
  const done = ({ confirm: "Запись подтверждена", done: "Готово", no_show: "Отмечено: клиент не приехал", cancel: "Запись отменена" } as const)[t];
  const told = ({ confirm: " — клиент получил уведомление", done: ". Предоплата ушла сервису", no_show: "", cancel: " — клиент уведомлён" } as const)[t];
  if (!res.ok) back(ret, { err: res.error });
  const mute = ({
    confirm: ". Сайт не ответил — клиента предупредите сами",
    done: ". Сайт не ответил — предоплата и уведомление зависли, проверьте на сайте",
    no_show: ". Сайт не ответил",
    cancel: ". Сайт не ответил — клиента предупредите сами",
  } as const)[t];
  back(ret, { ok: res.told ? `${done}${told}` : `${done}${mute}` });
}

export async function rescheduleAction(fd: FormData) {
  const { user, shop } = await ctx(fd, "bookings");
  const ret = returnTo(fd, "/kalendar");
  if (!shop.schedule) back(ret, { err: "Сначала задайте расписание" });
  const day = str(fd, "day");
  // Пост приходит из сетки: запись перетащили на конкретную колонку, и
  // ставить её на «первый свободный» нельзя — она уедет из-под курсора.
  // Из списка окон поля нет, и пост по-прежнему выбирает сервер.
  const postRaw = Number(str(fd, "postNo"));
  const postNo = Number.isInteger(postRaw) && postRaw > 0 ? postRaw : undefined;
  const res = await rescheduleBooking({ shopId: shop.id, bookingId: Number(str(fd, "bookingId")), schedule: shop.schedule, day, hhmm: str(fd, "hhmm"), postNo, actorUserId: user.id });
  revalidateBookings();
  if (!res.ok) back(ret, { err: res.error });
  // Возвращаем туда, откуда переносили: перетащили запись в недельной сетке —
  // остаёмся в неделе. Раньше любой перенос выбрасывал в день.
  back(ret, {
    d: day,
    // Режим переноса закончился — убираем его из адреса, иначе экран
    // возвращается с той же записью «в руках».
    move: null,
    do: null,
    ok: res.told ? "Запись перенесена — клиент уведомлён" : "Запись перенесена. Сайт не ответил — клиента предупредите сами",
  });
}

export async function createManualAction(fd: FormData) {
  const { user, shop, role } = await ctx(fd, "bookings");
  const day = str(fd, "day");
  const listingId = Number(str(fd, "listingId"));
  const postRaw = Number(str(fd, "postNo"));
  const postNo = Number.isInteger(postRaw) && postRaw > 0 ? postRaw : undefined;
  const hhmm = str(fd, "hhmm");
  // Пришли из отчёта — пункт сметы и запись-источник тянем через все ошибки,
  // иначе повторная попытка потеряет связь.
  const fromInspection = Number(str(fd, "fromInspection")), fromDefect = Number(str(fd, "defect")), fromBooking = Number(str(fd, "fromBooking"));
  const fromReport = [fromInspection, fromDefect, fromBooking].every(n => Number.isInteger(n) && n > 0);
  const backTo = str(fd, "back");
  const keep = {
    d: day, s: String(listingId), post: postNo ? String(postNo) : undefined, t: hhmm || undefined,
    back: backTo.startsWith("/") && !backTo.startsWith("//") ? backTo : undefined,
    ...(fromReport ? { fromInspection: String(fromInspection), defect: String(fromDefect), fromBooking: String(fromBooking) } : {}),
  };
  const ret = "/kalendar/novaya";
  if (!shop.schedule) back(ret, { ...keep, err: "Сначала задайте расписание" });
  const services = await listServices(shop.id);
  const svc = services.find(s => s.listingId === listingId);
  if (!svc) back(ret, { ...keep, err: "Выберите услугу" });
  // Право на запись из отчёта проверяем ДО создания: иначе мастер получал бы
  // отказ уже после того, как окно в календаре занято, и сирота оставалась бы
  // висеть. Экран кнопку прячет — здесь граница.
  if (fromReport && !can(role, "closeBooking")) {
    back(`/zapis/${fromBooking}/otchet`, { d: day, err: "Записать на работу из отчёта может админ или хозяин" });
  }
  const name = str(fd, "name");
  const phoneRaw = str(fd, "phone");
  const vehicle = str(fd, "vehicle");
  const plateRaw = str(fd, "plate");
  const vinRaw = str(fd, "vin");
  // Набранное возвращаем в адрес при любом отказе: поля формы живут в
  // браузере, и без этого опечатка в VIN стирала бы имя, телефон и машину,
  // которые человек только что набирал при клиенте.
  const typed = {
    n: name || undefined, ph: phoneRaw || undefined, v: vehicle || undefined,
    pl: plateRaw || undefined, vin: vinRaw || undefined,
  };
  const step2 = { ...keep, ...typed, step: "2" };
  if (!name) back(ret, { ...step2, err: "Имя клиента обязательно" });
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) back(ret, { ...step2, err: "Телефон не разобран — укажите в формате +7…" });
  const plateBad = plateProblem(plateRaw);
  if (plateBad) back(ret, { ...step2, err: plateBad });
  const vinBad = vinProblem(vinRaw);
  if (vinBad) back(ret, { ...step2, err: vinBad });
  if (!/^\d{2}:\d{2}$/.test(hhmm)) back(ret, { ...keep, ...typed, step: "1", err: "Выберите время" });
  const res = await createManualBooking({
    shopId: shop.id, schedule: shop.schedule, day, hhmm, service: toBookingService(svc), listingId: svc.listingId,
    postNo, client: { name: name.slice(0, 80), phone }, vehicle, plate: plateRaw, vin: vinRaw,
    comment: str(fd, "comment"), actorUserId: user.id,
  });
  revalidateBookings();
  if (!res.ok) back(ret, { ...keep, ...typed, step: "1", err: res.error });
  if (fromReport) {
    // Запись уже есть; связь с пунктом сметы — на сайте. Не связалось — запись
    // всё равно создана, и об этом честно в отчёте.
    const link = await linkItemBooking({ shopId: shop.id, actorUserId: user.id, inspectionId: fromInspection, defectId: fromDefect, bookingId: res.id });
    revalidatePath(`/zapis/${fromBooking}/otchet`);
    back(`/zapis/${fromBooking}/otchet`, link.ok
      ? { d: day, ok: `Записан: ${svc.title}, ${hhmm}` }
      : { d: day, err: `Запись создана, но к пункту отчёта не привязалась: ${link.error}` });
  }
  // Ведём в карточку созданной записи, а не в список дня: за стойкой сразу
  // после «Записать» смотрят, что получилось, и оттуда же переносят или
  // отменяют. Раньше запись приходилось искать в сетке глазами.
  back(`/zapis/${res.id}`, { d: day, ok: `Записан: ${svc.title}, ${hhmm}` });
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
