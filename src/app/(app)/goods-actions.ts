"use server";
// Серверные действия магазина товаров. Каждое: контекст → витрина магазина
// → роль → вызов сайта (lib/api/goods.ts) → revalidate → назад на экран с
// итогом в адресе (?ok= / ?err=). Своей базы у магазина нет: всё, что
// делает действие, делает сайт, и ответ сайта — единственный источник
// правды о том, что получилось.
//
// Проверка роли здесь — подсказка, а не граница: сайт сверяет actorUserId
// сам и откажет, если роль не та. Но уводить человека на сайт за отказом,
// который мы и так знаем, незачем — говорим сразу.
//
// ЧЕСТНО ПРО СООБЩЕНИЕ КЛИЕНТУ. Покупателю с учёткой сайт шлёт уведомление
// сам; клиенту по звонку учётки нет, и сайт ему не пишет — переход отдаёт
// готовый текст (clientMessage), а экран показывает кнопку «Открыть
// WhatsApp». Открыть wa.me из серверного действия нельзя (редирект увёл бы
// из приложения), поэтому текст едет в адрес возврата (?msg=).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, HOME_PATH, type Section } from "@/lib/access";
import {
  createGoodsOrder, extendGoodsReserve, isGoodsOrderStatus, isGoodsVertical, isStockMode, saveGoodsClientNote,
  saveGoodsOrderNote, saveGoodsPrice, saveGoodsSettings, saveGoodsStock, transitionGoodsOrder,
  type GoodsOrderStatus, type GoodsVertical,
} from "@/lib/api/goods";
import { serviceContext, type ServiceContext } from "@/lib/context";
import { todayLocal } from "@/lib/format";
import { parseClientDates } from "@/lib/goods/clients";
import { formEcho, parseOrderForm, parseSerials } from "@/lib/goods/order-form";
import { whenLabel } from "@/lib/goods/orders";
import { normalizePhone } from "@/lib/phone";
import { localTime } from "@/lib/sto/slots";

/**
 * Назад на экран: запрос адреса возврата сохраняем, свой итог дописываем
 * вместо прошлых ok/err/msg. null в значении — «убрать этот параметр»:
 * после удачного перехода шторка не должна открыться снова.
 */
function back(path: string, q: Record<string, string | undefined | null>): never {
  const i = path.indexOf("?");
  const base = i === -1 ? path : path.slice(0, i);
  const sp = new URLSearchParams(i === -1 ? "" : path.slice(i + 1));
  for (const k of ["ok", "err", "msg"]) sp.delete(k);
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

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isInteger(n) ? n : NaN;
};
const flag = (fd: FormData, k: string) => ["1", "on", "true"].includes(str(fd, k));

/** Кто и откуда: нет витрины — на вход; не магазин — на экран сервиса; раздел закрыт роли — назад с отказом. */
async function ctx(section: Section, ret: string): Promise<ServiceContext> {
  const c = await serviceContext();
  if (!c) redirect("/");
  if (c.shop.kind !== "goods") redirect(HOME_PATH[c.role]);
  if (!can(c.role, section)) {
    back(ret, { do: null, err: section === "goodsSettings" ? "Это может только хозяин магазина" : "Это может админ или хозяин магазина" });
  }
  return c;
}

/** Экраны, где видны заказы, остаток и клиенты: после любой правки обновляем все. */
function revalidateGoods(orderId?: number) {
  for (const p of ["/magazin", "/zakazy", "/tovary", "/pokupateli", "/menu"]) revalidatePath(p);
  if (orderId) revalidatePath(`/zakazy/${orderId}`);
}

const DONE: Record<GoodsOrderStatus, string> = {
  new: "Статус обновлён",
  assembling: "Заказ принят",
  ready: "Заказ готов",
  shipping: "Передан курьеру",
  delivered: "Заказ закрыт",
  cancelled: "Заказ отменён",
};

/** «Собрать к» из поля формы: ЧЧ:ММ — сегодня по часам магазина; ISO — как есть. */
function readyByOf(raw: string): string | undefined {
  if (!raw) return undefined;
  if (/^\d{2}:\d{2}$/.test(raw)) return localTime(todayLocal(), raw).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Серийники из полей serial_<listingId> — ключи берём из самой формы. */
function serialsOf(fd: FormData) {
  const ids: { listingId: number }[] = [];
  for (const k of fd.keys()) {
    const m = /^serial_(\d+)$/.exec(k);
    if (m) ids.push({ listingId: Number(m[1]) });
  }
  return parseSerials(fd, ids);
}

// ─────────── Заказы ───────────

export async function transitionOrderAction(fd: FormData) {
  const orderId = int(fd, "orderId");
  const ret = returnTo(fd, Number.isInteger(orderId) ? `/zakazy/${orderId}` : "/zakazy");
  const c = await ctx("goods", ret);
  if (!Number.isInteger(orderId) || orderId <= 0) back(ret, { do: null, err: "Заказ не найден" });
  const status = str(fd, "status");
  if (!isGoodsOrderStatus(status)) back(ret, { do: null, err: "Неизвестный переход" });
  const courierId = str(fd, "courierId") || undefined;
  const cancelReason = str(fd, "cancelReason").slice(0, 300) || undefined;
  const serials = serialsOf(fd);
  const paid = flag(fd, "paid");

  const res = await transitionGoodsOrder({
    shopId: c.shop.id, actorUserId: c.userId, orderId, status,
    readyBy: readyByOf(str(fd, "readyBy")),
    courierId,
    serials: serials.length > 0 ? serials : undefined,
    paid: paid || undefined,
    cancelReason,
  });
  revalidateGoods(orderId);
  if (!res.ok) back(ret, { err: res.error });
  const { order, clientMessage } = res.data;
  const done = status === "delivered" && paid ? "Заказ закрыт, оплата отмечена" : DONE[status];
  // Честно про уведомление: с учёткой клиента предупредил сайт, без — только
  // WhatsApp из нашего телефона, и кнопка на экране.
  const told = order.buyer.hasAccount ? " — клиент получил уведомление сайта" : clientMessage ? " — напишите клиенту в WhatsApp" : "";
  back(ret, { do: null, ok: `${done}${told}`, msg: clientMessage ?? undefined });
}

export async function extendReserveAction(fd: FormData) {
  const orderId = int(fd, "orderId");
  const ret = returnTo(fd, Number.isInteger(orderId) ? `/zakazy/${orderId}` : "/zakazy");
  const c = await ctx("goods", ret);
  if (!Number.isInteger(orderId) || orderId <= 0) back(ret, { do: null, err: "Заказ не найден" });
  const daysRaw = int(fd, "days");
  const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 14 ? daysRaw : 2;
  const res = await extendGoodsReserve({ shopId: c.shop.id, actorUserId: c.userId, orderId, days });
  revalidateGoods(orderId);
  if (!res.ok) back(ret, { err: res.error });
  const until = res.data.reserveUntil ? ` до ${whenLabel(res.data.reserveUntil)}` : "";
  back(ret, { do: null, ok: `Резерв продлён${until}` });
}

export async function saveOrderNoteAction(fd: FormData) {
  const orderId = int(fd, "orderId");
  const ret = returnTo(fd, Number.isInteger(orderId) ? `/zakazy/${orderId}` : "/zakazy");
  const c = await ctx("goods", ret);
  if (!Number.isInteger(orderId) || orderId <= 0) back(ret, { do: null, err: "Заказ не найден" });
  const note = str(fd, "note").slice(0, 500);
  const res = await saveGoodsOrderNote({ shopId: c.shop.id, actorUserId: c.userId, orderId, note });
  revalidateGoods(orderId);
  if (!res.ok) back(ret, { err: res.error });
  back(ret, { do: null, ok: note ? "Заметка сохранена" : "Заметка стёрта" });
}

/** Назад в форму заказа с отказом: позиции и набранное — в адрес, чтобы не стёрлось. */
function backToForm(fd: FormData, error: string): never {
  const sp = new URLSearchParams({ step: "1" });
  const items = str(fd, "items");
  if (items) sp.set("i", items);
  for (const [k, v] of Object.entries(formEcho(fd))) sp.set(k, v);
  sp.set("err", error);
  redirect(`/zakazy/novyi?${sp.toString()}`);
}

export async function createOrderAction(fd: FormData) {
  const c = await ctx("goods", "/zakazy/novyi");
  const parsed = parseOrderForm(fd);
  if (!parsed.ok) backToForm(fd, parsed.error);
  const res = await createGoodsOrder({ shopId: c.shop.id, actorUserId: c.userId, ...parsed.input });
  if (!res.ok) backToForm(fd, res.error);
  revalidateGoods(res.data.id);
  // Позиции в адресе больше не нужны — их принял сайт; в карточку с итогом.
  const ok = parsed.input.accept ? `Заказ № ${res.data.number} заведён и принят` : `Заказ № ${res.data.number} заведён`;
  redirect(`/zakazy/${res.data.id}?ok=${encodeURIComponent(ok)}`);
}

// ─────────── Товары ───────────

/**
 * Одна шторка — два маршрута сайта: цена и остаток живут в разных таблицах
 * (объявление и goods_stock), и сайт правит их порознь. Шлём только то, что
 * изменилось: лишний вызов остатка — лишний триггер видимости на витрине.
 */
export async function saveItemAction(fd: FormData) {
  const ret = returnTo(fd, "/tovary");
  const c = await ctx("goods", ret);
  const listingId = int(fd, "listingId");
  if (!Number.isInteger(listingId) || listingId <= 0) back(ret, { edit: null, err: "Товар не найден" });
  const who = { shopId: c.shop.id, actorUserId: c.userId, listingId };

  const priceRaw = str(fd, "price").replace(/\s+/g, "");
  const price0 = Number(str(fd, "price0").replace(/\s+/g, ""));
  if (priceRaw) {
    const price = Math.round(Number(priceRaw));
    if (!Number.isFinite(price) || price < 1 || price > 100_000_000) back(ret, { err: "Цена — число от 1 до 100 000 000 ₽" });
    if (price !== price0) {
      const res = await saveGoodsPrice({ ...who, price });
      if (!res.ok) back(ret, { err: res.error });
    }
  }

  const modeRaw = str(fd, "mode");
  const mode0 = str(fd, "mode0");
  const stock: { mode?: "count" | "today" | "on_order"; qty?: number; lowThreshold?: number } = {};
  if (modeRaw) {
    if (!isStockMode(modeRaw)) back(ret, { err: "Режим остатка — штуки, «есть сегодня» или «под заказ»" });
    if (modeRaw !== mode0) stock.mode = modeRaw;
  }
  const qtyRaw = str(fd, "qty");
  if (qtyRaw) {
    const qty = int(fd, "qty");
    if (!Number.isInteger(qty) || qty < 0 || qty > 99_999) back(ret, { err: "Остаток — целое число от 0 до 99 999" });
    if (!mode0 || qty !== int(fd, "qty0")) stock.qty = qty;
  }
  const lowRaw = str(fd, "low");
  if (lowRaw) {
    const low = int(fd, "low");
    if (!Number.isInteger(low) || low < 0 || low > 999) back(ret, { err: "Порог «кончаются» — целое число от 0 до 999" });
    if (!mode0 || low !== int(fd, "low0")) stock.lowThreshold = low;
  }
  if (Object.keys(stock).length > 0) {
    const res = await saveGoodsStock({ ...who, ...stock });
    revalidateGoods();
    if (!res.ok) back(ret, { err: res.error });
  }
  revalidateGoods();
  back(ret, { edit: null, mode: null, ok: "Сохранено" });
}

// ─────────── Клиенты ───────────

export async function saveGoodsClientNoteAction(fd: FormData) {
  const ret = returnTo(fd, "/pokupateli");
  const c = await ctx("goods", ret);
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) back(ret, { note: null, err: "Телефон клиента не разобран" });
  const name = str(fd, "name").slice(0, 80);
  const note = str(fd, "note").slice(0, 1000);
  const dates = parseClientDates(str(fd, "dates"));
  if (!dates.ok) back(ret, { err: dates.error });
  const res = await saveGoodsClientNote({ shopId: c.shop.id, actorUserId: c.userId, phone, name, note, dates: dates.dates });
  revalidateGoods();
  if (!res.ok) back(ret, { err: res.error });
  back(ret, { note: null, ok: name || note || dates.dates.length > 0 ? "Заметка сохранена" : "Заметка стёрта" });
}

// ─────────── Настройки ───────────

const VERTICAL_LABEL: Record<GoodsVertical, string> = { flowers: "цветы", electronics: "электроника", general: "другие товары" };

export async function saveVerticalAction(fd: FormData) {
  const c = await ctx("goodsSettings", "/menu");
  const vertical = str(fd, "vertical");
  if (!isGoodsVertical(vertical)) back("/menu", { do: "vertical", err: "Выберите, чем торгует магазин" });
  const res = await saveGoodsSettings({ shopId: c.shop.id, actorUserId: c.userId, vertical });
  revalidateGoods();
  if (!res.ok) back("/menu", { do: "vertical", err: res.error });
  back("/menu", { ok: `Вертикаль магазина: ${VERTICAL_LABEL[res.data.vertical]}` });
}
