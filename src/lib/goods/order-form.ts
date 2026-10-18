// Форма заказа по звонку: позиции живут в адресе (экран серверный, степпер
// количества — ссылки), остальное — обычные поля формы. Здесь их разбор в
// тело POST /orders/create (контракт goods §3.1) и серийники для выдачи
// (§3.2). Чисто, под тестом: отказ — одной русской строкой для Flash.
import { isGoodsMethod, isPhonePayment, type CreateGoodsOrderInput } from "@/lib/api/goods";
import { normalizePhone } from "@/lib/phone";
import { localTime } from "@/lib/sto/slots";

export type Picked = { listingId: number; qty: number };

/** Контракт: 1…20 позиций, qty 1…999. */
export const MAX_ITEMS = 20;
export const MAX_QTY = 999;

/** «7701:1,7702:2» → позиции; мусор пропускаем, повтор — последняя запись побеждает. */
export function parseItemsParam(raw: string): Picked[] {
  const map = new Map<number, number>();
  for (const part of raw.split(",")) {
    const [idRaw, qtyRaw] = part.split(":");
    const id = Number(idRaw);
    const qty = Number(qtyRaw ?? "1");
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0) continue;
    map.delete(id);
    map.set(id, Math.min(qty, MAX_QTY));
  }
  return [...map].slice(0, MAX_ITEMS).map(([listingId, qty]) => ({ listingId, qty }));
}

export function serializeItemsParam(items: readonly Picked[]): string {
  return items.map(i => `${i.listingId}:${i.qty}`).join(",");
}

/** Степпер: ±1 к позиции; ноль убирает её, потолок — max (остаток) и 999. */
export function withQty(items: readonly Picked[], listingId: number, delta: number, max: number = MAX_QTY): Picked[] {
  const cap = Math.max(0, Math.min(max, MAX_QTY));
  const cur = items.find(i => i.listingId === listingId)?.qty ?? 0;
  const next = Math.min(cap, cur + delta);
  const rest = items.filter(i => i.listingId !== listingId);
  if (next <= 0) return rest;
  if (cur === 0 && rest.length >= MAX_ITEMS) return [...rest];
  return cur === 0 ? [...rest, { listingId, qty: next }] : items.map(i => i.listingId === listingId ? { ...i, qty: next } : i);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const HHMM = /^\d{2}:\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = { ok: true; input: CreateGoodsOrderInput } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });

/**
 * Поля формы → тело запроса. Проверяем то, без чего сайт точно откажет
 * (контракт §3.1), остальное он проверит сам и ответит по-русски.
 */
export function parseOrderForm(fd: FormData): Parsed {
  const items = parseItemsParam(str(fd, "items"));
  if (items.length === 0) return fail("Выберите хотя бы один товар");
  const name = str(fd, "name").slice(0, 60);
  if (!name) return fail("Укажите имя клиента");
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return fail("Телефон не разобран — укажите в формате +7…");
  const method = str(fd, "method");
  if (!isGoodsMethod(method)) return fail("Выберите доставку или самовывоз");

  const input: CreateGoodsOrderInput = { items, buyer: { name, phone }, method };

  if (method === "courier") {
    const address = str(fd, "address").slice(0, 200);
    if (!address) return fail("Укажите адрес доставки");
    input.address = address;
  }
  const priceRaw = str(fd, "deliveryPrice");
  if (priceRaw) {
    const price = Number(priceRaw.replace(/\s+/g, ""));
    if (!Number.isFinite(price) || price < 0 || price > 100_000) return fail("Стоимость доставки — число от 0 до 100 000");
    input.deliveryPrice = Math.round(price);
  }
  const day = str(fd, "deliveryDate");
  if (day) {
    if (!DAY.test(day)) return fail("Дата доставки — в виде ГГГГ-ММ-ДД");
    input.deliveryDate = day;
  }
  const from = str(fd, "windowFrom");
  const to = str(fd, "windowTo");
  if (from || to) {
    if (!day) return fail("Окно доставки — только вместе с датой");
    if (!HHMM.test(from) || !HHMM.test(to)) return fail("Окно доставки — время от и до, например 10:00 и 12:00");
    if (from >= to) return fail("Окно доставки: начало должно быть раньше конца");
    input.window = { from, to };
  }
  const pickupAt = str(fd, "pickupAt");
  if (pickupAt) {
    // datetime-local отдаёт «ГГГГ-ММ-ДДTЧЧ:ММ» без зоны — это часы магазина.
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(pickupAt);
    if (!m) return fail("Время самовывоза не разобрано");
    input.pickupAt = localTime(m[1], m[2]).toISOString();
  }
  const payment = str(fd, "payment");
  if (payment) {
    if (!isPhonePayment(payment)) return fail("Способ оплаты — при получении, перевод или ссылка");
    input.payment = payment;
  }
  const recipientName = str(fd, "recipientName").slice(0, 60);
  if (recipientName) {
    const recipientPhone = normalizePhone(str(fd, "recipientPhone"));
    input.recipient = recipientPhone ? { name: recipientName, phone: recipientPhone } : { name: recipientName };
  }
  const card = str(fd, "card").slice(0, 300);
  if (card) input.card = card;
  const composition = str(fd, "composition").slice(0, 500);
  if (composition) input.composition = composition;
  const note = str(fd, "note").slice(0, 500);
  if (note) input.note = note;
  const daysRaw = str(fd, "reserveDays");
  if (daysRaw) {
    const days = Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 14) return fail("Резерв — от 1 до 14 дней");
    input.reserveDays = days;
  }
  const accept = str(fd, "accept");
  if (accept === "1" || accept === "on") input.accept = true;
  return { ok: true, input };
}

/** Серийники из полей serial_<listingId> — до 40 знаков, пустые пропускаем. */
export function parseSerials(fd: FormData, items: readonly { listingId: number }[]): { listingId: number; serial: string }[] {
  const out: { listingId: number; serial: string }[] = [];
  for (const it of items) {
    const serial = str(fd, `serial_${it.listingId}`).slice(0, 40);
    if (serial) out.push({ listingId: it.listingId, serial });
  }
  return out;
}

/** Поля, которые едут обратно в адрес после отказа — чтобы набранное не стёрлось. */
export const ECHO_FIELDS = [
  "name", "phone", "method", "address", "deliveryPrice", "deliveryDate", "windowFrom", "windowTo", "pickupAt",
  "payment", "recipientName", "recipientPhone", "card", "composition", "note", "reserveDays",
] as const;

export function formEcho(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ECHO_FIELDS) {
    const v = str(fd, k);
    if (v) out[k] = v;
  }
  return out;
}
