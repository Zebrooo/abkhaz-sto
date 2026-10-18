// Правила экрана заказов: как подписать статус, что положить в пилюли, какое
// действие у карточки главное и куда уводит «назад». Чисто — без базы и сети:
// их читают серверные экраны и действия, а тест проверяет на образцах с
// артборда. Данные — GoodsOrderOut контракта (lib/api/goods.ts).
//
// ОДНО ГЛАВНОЕ ДЕЙСТВИЕ НА КАРТОЧКЕ (артборд «Заказы»): новый → Принять,
// принят → Готов (курьерскому ещё «Курьеру»), готов → «Выдан и оплачен» или
// «Курьеру», у курьера → «Доставлен». Отказ — с любой стадии, но не кнопкой
// списка: ему нужна причина, это шторка карточки заказа. Что разрешено на
// самом деле, говорит сайт полем next — мы не придумываем переходов сверх него.
import type { GoodsOrderOut, GoodsOrderStatus, GoodsOrderView, GoodsPayment } from "@/lib/api/goods";
import { addDays, count, dayShort, relativeAt, rub } from "@/lib/format";
import { localDay, localHHMM } from "@/lib/sto/slots";

export const ORDER_VIEW_LABEL: Record<GoodsOrderView, string> = {
  new: "Новые", work: "В работе", ready: "Готовы", delivery: "Доставка", closed: "Закрыты",
};

/** В каком виде списка лежит заказ этого статуса — «назад» из карточки ведёт туда. */
export const VIEW_OF_STATUS: Record<GoodsOrderStatus, GoodsOrderView> = {
  new: "new", assembling: "work", ready: "ready", shipping: "delivery", delivered: "closed", cancelled: "closed",
};

/** Тон пилюли — из существующих токенов: красный, янтарный, зелёный, чернильный, серый. */
export type Tone = "dng" | "warn" | "ok" | "ink" | "neu";
export type PillSpec = { text: string; tone: Tone };

/** Короткие подписи статусов — как на артборде: новый · собрать · готов · у курьера · закрыт · отказ. */
export const STATUS_LABEL: Record<GoodsOrderStatus, string> = {
  new: "новый", assembling: "собрать", ready: "готов", shipping: "у курьера", delivered: "закрыт", cancelled: "отказ",
};

const STATUS_TONE: Record<GoodsOrderStatus, Tone> = {
  new: "dng", assembling: "warn", ready: "ok", shipping: "ink", delivered: "neu", cancelled: "neu",
};

export const SOURCE_LABEL = { storefront: "с витрины", phone: "по телефону" } as const;

export const PAYMENT_LABEL: Record<GoodsPayment, string> = {
  online: "оплачено онлайн", on_receipt: "при получении", transfer: "перевод", link: "по ссылке",
};

/** Заказ ещё в работе: закрытые и отменённые — нет. */
export function isActive(status: GoodsOrderStatus): boolean {
  return status !== "delivered" && status !== "cancelled";
}

export function statusPill(o: GoodsOrderOut, now: Date = new Date()): PillSpec {
  if (o.status === "new") return { text: `новый · ${relativeAt(o.createdAt, now)}`, tone: "dng" };
  if (o.status === "assembling" && o.goods.readyBy) return { text: `собрать к ${localHHMM(new Date(o.goods.readyBy))}`, tone: "warn" };
  return { text: STATUS_LABEL[o.status], tone: STATUS_TONE[o.status] };
}

/** «сегодня», «завтра», «вчера» или «19.10» для дня YYYY-MM-DD по часам магазина. */
export function dayWord(day: string, now: Date = new Date()): string {
  const today = localDay(now);
  if (day === today) return "сегодня";
  if (day === addDays(today, 1)) return "завтра";
  if (day === addDays(today, -1)) return "вчера";
  return dayShort(day);
}

/** «сегодня 11:00», «завтра 10:00», «19.10 · 10:00» — момент по часам магазина. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = localDay(d);
  const word = dayWord(day, now);
  return word === dayShort(day) ? `${word} · ${localHHMM(d)}` : `${word} ${localHHMM(d)}`;
}

/**
 * «доставка · завтра 10:00–12:00», «самовывоз · сегодня 13:30». Окно даты —
 * точнее момента dueAt (он лишь начало окна), поэтому сначала оно; у заказов
 * с витрины окна нет — там slot строкой из Маркета.
 */
export function handoverLabel(o: GoodsOrderOut, now: Date = new Date()): string {
  const method = o.method === "courier" ? "доставка" : "самовывоз";
  const g = o.goods;
  if (g.deliveryDate && g.window) return `${method} · ${dayWord(g.deliveryDate, now)} ${g.window.from}–${g.window.to}`;
  if (o.dueAt) return `${method} · ${whenLabel(o.dueAt, now)}`;
  if (g.deliveryDate) return `${method} · ${dayWord(g.deliveryDate, now)}`;
  if (o.slot) return `${method} · ${o.slot}`;
  return method;
}

/** День передачи — сегодня: такой заказ подсвечиваем, его нельзя пропустить. */
function dueToday(o: GoodsOrderOut, now: Date): boolean {
  const today = localDay(now);
  if (o.goods.deliveryDate) return o.goods.deliveryDate === today;
  return !!o.dueAt && localDay(new Date(o.dueAt)) === today;
}

const CARD_MAX = 40;

/** Пилюли карточки — после статуса: передача, адрес, открытка, оплата, резерв. */
export function orderPills(o: GoodsOrderOut, now: Date = new Date()): PillSpec[] {
  const out: PillSpec[] = [];
  out.push({ text: handoverLabel(o, now), tone: isActive(o.status) && dueToday(o, now) ? "warn" : "neu" });
  if (o.method === "courier" && o.address) out.push({ text: o.address, tone: "neu" });
  if (o.goods.card) {
    const card = o.goods.card.length > CARD_MAX ? `${o.goods.card.slice(0, CARD_MAX - 1)}…` : o.goods.card;
    out.push({ text: `открытка: «${card}»`, tone: "neu" });
  }
  if (o.paidAt) out.push({ text: "оплачен", tone: "ok" });
  else out.push({ text: `оплата ${PAYMENT_LABEL[o.payment]}`, tone: "warn" });
  if (o.reserveUntil && isActive(o.status)) {
    out.push(o.reserveExpired
      ? { text: "резерв истёк", tone: "dng" }
      : { text: `резерв до ${whenLabel(o.reserveUntil, now)}`, tone: "warn" });
  }
  return out;
}

/** Первая позиция и «+ ещё N»: в строке списка места на всё нет. */
export function orderTitle(o: GoodsOrderOut): string {
  const first = o.items[0];
  if (!first) return `Заказ № ${o.number}`;
  const rest = o.items.length - 1;
  return rest > 0 ? `${first.title} + ещё ${count(rest, "позиция", "позиции", "позиций")}` : first.title;
}

/** «25 шт · 6 250 ₽ · с витрины». */
export function itemsLine(o: GoodsOrderOut): string {
  const qty = o.items.reduce((s, it) => s + it.qty, 0);
  return `${qty} шт · ${rub(o.total)} · ${SOURCE_LABEL[o.source]}`;
}

/**
 * Что нужно действию сверх статуса: readyBy — цветам при приёме («собрать
 * к»); courier — курьер при своей доставке; deliver — серийники электроники
 * при выдаче. none — кнопка жмётся прямо из списка; paid — вместе с переходом
 * отметить оплату (подпись кнопки так и говорит: «…и оплачен»).
 */
export type OrderAction = {
  status: GoodsOrderStatus;
  label: string;
  needs: "none" | "readyBy" | "courier" | "deliver";
  paid?: boolean;
};

/** Действия магазина по статусу, главное — первое. Переходы — только из next сайта. */
export function actionsFor(o: GoodsOrderOut): OrderAction[] {
  const has = (s: GoodsOrderStatus) => o.next.includes(s);
  const out: OrderAction[] = [];
  const deliver = (verb: string): OrderAction => o.goods.vertical === "electronics"
    ? { status: "delivered", label: o.paidAt ? verb : `${verb} и оплачен`, needs: "deliver" }
    : o.paidAt
      ? { status: "delivered", label: verb, needs: "none" }
      : { status: "delivered", label: `${verb} и оплачен`, needs: "none", paid: true };
  switch (o.status) {
    case "new":
      if (has("assembling")) out.push({ status: "assembling", label: "Принять", needs: o.goods.vertical === "flowers" ? "readyBy" : "none" });
      break;
    case "assembling":
      if (has("ready")) out.push({ status: "ready", label: "Готов", needs: "none" });
      if (has("shipping")) out.push({ status: "shipping", label: "Курьеру", needs: "courier" });
      break;
    case "ready":
      if (o.method === "courier") {
        if (has("shipping")) out.push({ status: "shipping", label: "Курьеру", needs: "courier" });
        if (has("delivered")) out.push(deliver("Доставлен"));
      } else if (has("delivered")) {
        out.push(deliver("Выдан"));
      }
      break;
    case "shipping":
      if (has("delivered")) out.push(deliver("Доставлен"));
      break;
  }
  return out;
}

export function canCancel(o: GoodsOrderOut): boolean {
  return o.next.includes("cancelled");
}

const digitsOf = (s: string) => s.replace(/\D+/g, "");

/** Поиск по номеру, имени, телефону, адресу и названиям позиций. */
export function matchOrder(o: GoodsOrderOut, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const d = digitsOf(needle);
  if (d && (digitsOf(o.number).includes(d) || String(o.id).includes(d) || (o.buyer.phone && digitsOf(o.buyer.phone).includes(d)))) return true;
  const hay = [o.buyer.name, o.address ?? "", o.goods.recipient?.name ?? "", ...o.items.map(it => it.title)].join(" ").toLowerCase();
  return hay.includes(needle);
}

/** Телефон в цифры для wa.me и tel:; пусто — null. */
export function phoneDigits(phone: string | null | undefined): string | null {
  const d = phone ? digitsOf(phone) : "";
  return d.length >= 7 ? d : null;
}

/** https://wa.me/<цифры>?text=… — сообщение клиенту; телефона нет — null. */
export function whatsappUrl(phone: string | null | undefined, text?: string | null): string | null {
  const d = phoneDigits(phone);
  if (!d) return null;
  return text ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/${d}`;
}

/** Время в строке «Ближайшие»: начало окна или самовывоза; без него — «—». */
export function upcomingTime(o: GoodsOrderOut): string {
  return o.dueAt ? localHHMM(new Date(o.dueAt)) : "—";
}

/** «ответить до 15 мин» / «ответить до 2 ч» — из market_settings.sla_new_hours. */
export function slaLabel(hours: number): string {
  if (!(hours > 0)) return "ответить как можно скорее";
  if (hours < 1) return `ответить до ${Math.round(hours * 60)} мин`;
  return `ответить до ${Number.isInteger(hours) ? hours : hours.toFixed(1)} ч`;
}
