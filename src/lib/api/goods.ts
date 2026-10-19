import "server-only";
// СРМ магазина товаров — заказы, товары с остатком, клиенты по телефону и
// сводка «Сегодня». Всё это живёт на сайте (market_orders, listings,
// goods_stock, goods_client_notes) и приезжает сюда подписанным запросом:
// своих таблиц у приложения нет (AGENTS.md). Зеркало контракта —
// docs/API-sushchnosti.md, первоисточник — abkhaz-auto,
// docs/sto-api-goods-2026-10-18.md. Имена полей здесь и там обязаны
// совпадать буква в букву: типы — копия §1 контракта.
//
// ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО. Цену позиции в заказе по звонку не передаём —
// сайт берёт цену объявления (решение спеки §7: владелец называет цену
// карточкой, а не устно). Позиций «свободной строкой» нет — только объявления
// магазина (§11.5). Рубильник goods_crm — на сайте: выключен — все маршруты
// отвечают not_found, и экраны показывают это как «раздел выключен», а не
// как пустой магазин.
import { siteGet, sitePost, sitePostForm, type ApiResult } from "@/lib/api/site-api";

// ─────────── Словарь ───────────

export const GOODS_VERTICALS = ["flowers", "electronics", "general"] as const;
/** Вертикаль магазина задаёт набор полей заказа: цветы — получатель и открытка, электроника — резерв и серийник. */
export type GoodsVertical = (typeof GOODS_VERTICALS)[number];

export function isGoodsVertical(v: unknown): v is GoodsVertical {
  return typeof v === "string" && (GOODS_VERTICALS as readonly string[]).includes(v);
}

export const GOODS_ORDER_STATUSES = ["new", "assembling", "ready", "shipping", "delivered", "cancelled"] as const;
/** Артборд: новый · принят/собрать · готов · у курьера · закрыт · отказ. */
export type GoodsOrderStatus = (typeof GOODS_ORDER_STATUSES)[number];

export function isGoodsOrderStatus(v: unknown): v is GoodsOrderStatus {
  return typeof v === "string" && (GOODS_ORDER_STATUSES as readonly string[]).includes(v);
}

export const ORDER_VIEWS = ["new", "work", "ready", "delivery", "closed"] as const;
/** Виды списка заказов — чипы экрана: new → new · work → assembling · ready → ready · delivery → shipping · closed → delivered + cancelled за 60 дней. */
export type GoodsOrderView = (typeof ORDER_VIEWS)[number];

export function isOrderView(v: unknown): v is GoodsOrderView {
  return typeof v === "string" && (ORDER_VIEWS as readonly string[]).includes(v);
}

/** С витрины (корзина Маркета) или заведён владельцем по звонку. */
export type GoodsOrderSource = "storefront" | "phone";

/**
 * online — оплата на сайте (только у заказов с витрины); on_receipt — при
 * получении; transfer — перевод; link — ссылка (кусок F).
 */
export type GoodsPayment = "online" | "on_receipt" | "transfer" | "link";
/** Способы оплаты, которые можно выбрать заказу по звонку. */
export const GOODS_PAYMENTS = ["on_receipt", "transfer", "link"] as const;
export type GoodsPhonePayment = (typeof GOODS_PAYMENTS)[number];

export function isPhonePayment(v: unknown): v is GoodsPhonePayment {
  return typeof v === "string" && (GOODS_PAYMENTS as readonly string[]).includes(v);
}

export type GoodsMethod = "courier" | "pickup";

export function isGoodsMethod(v: unknown): v is GoodsMethod {
  return v === "courier" || v === "pickup";
}

// ─────────── Заказы ───────────

export type GoodsOrderItemOut = {
  listingId: number;
  /** Карточка на сайте /ad/<slug>. */
  slug: string;
  title: string;
  /** ₽ за штуку, как записано в заказ. */
  price: number;
  qty: number;
  /** Обложка (готовый URL) или null. */
  img: string | null;
  /** Электроника: серийный номер, записан при выдаче. */
  serial: string | null;
  /** Электроника: гарантия, снимок на момент заказа. */
  warrantyMonths: number | null;
};

export type GoodsOrderGoods = {
  vertical: GoodsVertical;
  /** Цветы: получатель, если не покупатель. */
  recipient: { name: string; phone: string | null } | null;
  /** YYYY-MM-DD по часам магазина. */
  deliveryDate: string | null;
  /** «10:00»–«12:00». */
  window: { from: string; to: string } | null;
  /** Открытка. */
  card: string | null;
  /** Состав. */
  composition: string | null;
  /** «Собрать к» — ISO. */
  readyBy: string | null;
  /** Заметка владельца к заказу. */
  note: string | null;
  /** Причина отказа (при cancelled) — отдельно от заметки, с 19.10.2026; у старых заказов поля нет. */
  cancelReason?: string | null;
};

export type GoodsOrderOut = {
  id: number;
  /** «1 042» — для людей. */
  number: string;
  source: GoodsOrderSource;
  status: GoodsOrderStatus;
  createdAt: string;
  /** Последняя смена статуса. */
  updatedAt: string;
  method: GoodsMethod;
  /** Слаг региона (REGION_NAME). */
  city: string;
  /** Курьер: куда. */
  address: string | null;
  /** Окно доставки строкой («19.10 · 10:00–12:00» или слот Маркета). */
  slot: string | null;
  /** Комментарий покупателя с витрины. */
  comment: string | null;
  payment: GoodsPayment;
  /** Когда отмечена оплата (у online — момент оформления). */
  paidAt: string | null;
  /** Товары, ₽. */
  subtotal: number;
  /** Доставка, ₽ (0 — бесплатно или самовывоз). */
  delivery: number;
  /** subtotal + delivery. */
  total: number;
  items: GoodsOrderItemOut[];
  /** hasAccount — у заказа есть учётка покупателя: ему уходят уведомления сайта. */
  buyer: { name: string; phone: string | null; hasAccount: boolean };
  courier: { name: string; phone: string | null; own: boolean } | null;
  pickup: { address: string; hours: string } | null;
  /** Магазин возит сам → на «Курьеру» нужен courierId. */
  ownDelivery: boolean;
  /** Момент передачи: начало окна доставки или время самовывоза. */
  dueAt: string | null;
  /** Электроника: до какого момента держим. */
  reserveUntil: string | null;
  /** reserveUntil в прошлом, а заказ ещё активен. */
  reserveExpired: boolean;
  goods: GoodsOrderGoods;
  /** Заказов с этого телефона в магазине, включая этот («заказывает 2-й раз»). */
  clientOrdersCount: number;
  /** Какие переходы доступны магазину из текущего статуса. */
  next: GoodsOrderStatus[];
};

export type GoodsOrderCounts = { new: number; work: number; ready: number; delivery: number; closed: number; today: number };

/** Заказ по звонку — тело POST /orders/create (§3.1) без shopId и actorUserId. */
export type CreateGoodsOrderInput = {
  /** 1…20 позиций, qty 1…999; listingId — активное объявление ЭТОГО магазина. */
  items: { listingId: number; qty: number; price?: number }[];
  /** Имя 1…60; телефон нормализуется в E.164. */
  buyer: { name: string; phone: string };
  method: GoodsMethod;
  /** Обязателен при courier (до 200). */
  address?: string;
  /** Слаг региона; по умолчанию регион магазина. */
  city?: string;
  /** ₽, 0…100 000, по умолчанию 0. */
  deliveryPrice?: number;
  /** YYYY-MM-DD по часам магазина. */
  deliveryDate?: string;
  /** «HH:MM», from < to; только вместе с deliveryDate. */
  window?: { from: string; to: string };
  /** Самовывоз ко времени — ISO. */
  pickupAt?: string;
  /** По умолчанию on_receipt. */
  payment?: GoodsPhonePayment;
  /** Цветы: получатель, если не покупатель. */
  recipient?: { name: string; phone?: string };
  /** Открытка, до 300. */
  card?: string;
  /** Состав, до 500. */
  composition?: string;
  /** Заметка владельца, до 500. */
  note?: string;
  /** 1…14; по умолчанию 2 у electronics + pickup, иначе резерва нет. */
  reserveDays?: number;
  /** true — сразу в assembling («принят»); иначе new. */
  accept?: boolean;
};

/** Переход — тело POST /orders/transition (§3.2) без shopId и actorUserId. */
export type TransitionGoodsOrderInput = {
  orderId: number;
  status: GoodsOrderStatus;
  /** При assembling: «собрать к» — ISO (в goods.readyBy и в dueAt, если пуст). */
  readyBy?: string;
  /** При shipping у магазина со своей доставкой — id из shops.couriers. */
  courierId?: string;
  /** При delivered: серийники по позициям (до 40 знаков). */
  serials?: { listingId: number; serial: string }[];
  /** Отметить оплату — paidAt = сейчас. */
  paid?: boolean;
  /** При cancelled, до 300 — уходит в goods.cancelReason (заметка goods.note остаётся). */
  cancelReason?: string;
};

export type TransitionGoodsOrderOut = {
  order: GoodsOrderOut;
  /** Готовый текст для WhatsApp клиенту (с учёткой и без): на assembling, ready, shipping, delivered; иначе null. */
  clientMessage: string | null;
};

// ─────────── Товары ───────────

export const GOODS_STOCK_MODES = ["count", "today", "on_order"] as const;
/** count — считаем штуки · today — «есть сегодня» (цветы, без счёта) · on_order — «под заказ». */
export type GoodsStockMode = (typeof GOODS_STOCK_MODES)[number];

export function isStockMode(v: unknown): v is GoodsStockMode {
  return typeof v === "string" && (GOODS_STOCK_MODES as readonly string[]).includes(v);
}

/**
 * visible — активно на витрине · hidden_stock — снято остатком 0 (вернётся
 * само при qty > 0) · hidden_owner — снято владельцем / сроком жизни товара
 * (вернуть — в кабинете сайта) · hidden_moderation — снято модерацией.
 */
export type GoodsVisibility = "visible" | "hidden_stock" | "hidden_owner" | "hidden_moderation";

export type GoodsStock = {
  mode: GoodsStockMode;
  /** На складе (у today/on_order — не используется, 0). */
  qty: number;
  /** В активных заказах (считается по заказам, не хранится). */
  reserved: number;
  /** qty − reserved, не меньше 0. */
  available: number;
  lowThreshold: number;
  /** mode = count и available ≤ lowThreshold. */
  low: boolean;
};

export type GoodsItemOut = {
  listingId: number;
  slug: string;
  title: string;
  /** Первые 160 знаков описания — подстрока под названием. */
  description: string | null;
  /** ₽; null — цена не указана. */
  price: number | null;
  /** elektronika, kompyutery, raznoye, … */
  categorySlug: string;
  categoryLabel: string;
  img: string | null;
  visibility: GoodsVisibility;
  /** null — остаток не ведётся (строки goods_stock нет). */
  stock: GoodsStock | null;
  updatedAt: string;
};

export type GoodsItemCounts = { all: number; low: number; hidden: number };
export type GoodsCategoryCount = { slug: string; label: string; count: number };

export const ITEM_VIEWS = ["all", "low", "hidden"] as const;
/** Чип «Кончаются» = low; «скрыто» = hidden (все три причины). */
export type GoodsItemView = (typeof ITEM_VIEWS)[number];

export function isItemView(v: unknown): v is GoodsItemView {
  return typeof v === "string" && (ITEM_VIEWS as readonly string[]).includes(v);
}

/** Новый товар — тело POST /items/create (§4.1) без shopId и actorUserId. */
export type CreateGoodsItemInput = {
  /** 5…200. */
  title: string;
  /** ₽, 1…100 000 000. */
  price: number;
  /** Раздел группы goods, разрешённый магазинам. */
  categorySlug: string;
  /** До 4000. */
  description?: string;
  /** Поля раздела (как у формы подачи); warranty_months — гарантия по умолчанию для заказов. */
  attrs?: Record<string, unknown>;
  /** Нет — остаток не ведётся. */
  stock?: { mode: GoodsStockMode; qty?: number; lowThreshold?: number };
  /** Кадры из /items/photo, до 14, в порядке показа. */
  stagedIds?: number[];
};

// ─────────── Клиенты ───────────

export type GoodsClientDate = {
  /** «день рождения мамы», «8 марта». */
  label: string;
  /** «MM-DD»; год не хранится — дата повторяется ежегодно. */
  day: string;
  kind: "holiday" | "upgrade_offered";
};

/**
 * regular — 3+ закрытых заказа · holiday_soon — дата в ближайшие 14 дней ·
 * dormant — последний заказ больше 90 дней назад · warranty_ending — гарантия
 * по выданному заказу кончается в ближайшие 30 дней (электроника).
 */
export type GoodsClientSegment = "regular" | "holiday_soon" | "dormant" | "warranty_ending";

export type GoodsClientOut = {
  /** E.164 — ключ клиента. */
  phone: string;
  /** Из заметки, иначе из последнего заказа. */
  name: string;
  /** Без отменённых. */
  ordersCount: number;
  /** delivered. */
  closedCount: number;
  /** ₽ по закрытым. */
  totalClosed: number;
  firstAt: string;
  /** Последний заказ (любой статус, кроме отменённых). */
  lastAt: string;
  lastStatus: GoodsOrderStatus;
  /** Хоть один заказ с учёткой сайта. */
  hasAccount: boolean;
  /** '' — нет. */
  note: string;
  dates: GoodsClientDate[];
  segments: GoodsClientSegment[];
  /** Ближайшая дата из dates. */
  nextDate: { label: string; day: string; inDays: number } | null;
  /** Ближайшее окончание гарантии по выданным заказам. */
  warrantyEndsAt: string | null;
};

export const CLIENT_VIEWS = ["all", "regular", "holidays", "dormant", "warranty"] as const;
export type GoodsClientView = (typeof CLIENT_VIEWS)[number];

export function isClientView(v: unknown): v is GoodsClientView {
  return typeof v === "string" && (CLIENT_VIEWS as readonly string[]).includes(v);
}

export type GoodsClientCounts = { all: number; regular: number; holidays: number; dormant: number; warranty: number };

// ─────────── Сводка ───────────

export type GoodsTodayOut = {
  shop: {
    id: number; name: string; slug: string | null; vertical: GoodsVertical;
    regionSlug: string | null;
    storefront: "off" | "requested" | "published" | "hidden";
    /** https://abkhaz-auto.ru/m/<slug> у опубликованной. */
    storefrontUrl: string | null;
  };
  /** until — YYYY-MM-DD (shops.access_until); null — срок не задан (считается как бессрочно). */
  subscription: { until: string | null; daysLeft: number | null; expired: boolean };
  /** overdueNew — новых без ответа дольше slaNewHours; today — активных с dueAt или reserveUntil в сегодняшних сутках магазина. */
  orders: { new: number; overdueNew: number; today: number; todayCourier: number; todayPickup: number };
  /** market_settings.sla_new_hours — «ответить до …». */
  slaNewHours: number;
  storefront7d: { views: number; phoneReveals: number };
  /** С 1-го числа по часам магазина; revenue — сумма total закрытых (delivered) заказов. */
  month: { from: string; revenue: number; closed: number };
  /** До 5 активных заказов по dueAt (без dueAt — в конце, по времени создания); clientOrdersCount у них всегда 1. */
  upcoming: GoodsOrderOut[];
  /** null — активных кампаний у владельца нет. */
  ads: {
    campaignId: number; title: string; status: string;
    /** Кошелёк владельца, ₽. */
    balance: number;
    /** Расход за 7 дней, ₽. */
    spent7d: number;
    /** balance ÷ средний дневной расход; null — расхода нет и лимита нет. */
    daysLeft: number | null;
  } | null;
};

// ─────────── Вызовы ───────────

type Who = { shopId: number; actorUserId: string };

/** GET /api/sto/goods/today?shopId&actorUserId → GoodsTodayOut */
export function fetchGoodsToday(who: Who): Promise<ApiResult<GoodsTodayOut>> {
  return siteGet<GoodsTodayOut>("goods/today", who);
}

/** GET /api/sto/goods/settings?shopId&actorUserId → { vertical } */
export function fetchGoodsSettings(who: Who): Promise<ApiResult<{ vertical: GoodsVertical }>> {
  return siteGet<{ vertical: GoodsVertical }>("goods/settings", who);
}

/** POST /api/sto/goods/settings { shopId, actorUserId, vertical } → { vertical } — хозяину. */
export function saveGoodsSettings(input: Who & { vertical: GoodsVertical }): Promise<ApiResult<{ vertical: GoodsVertical }>> {
  return sitePost<{ vertical: GoodsVertical }>("goods/settings", input);
}

/**
 * GET /api/sto/goods/orders?shopId&actorUserId&view → { orders, counts } —
 * не больше 200 на вид; активные — по dueAt (без него — новые сверху),
 * закрытые — новые сверху. Счётчики — по всем видам сразу.
 */
export function fetchGoodsOrders(input: Who & { view: GoodsOrderView }): Promise<ApiResult<{ orders: GoodsOrderOut[]; counts: GoodsOrderCounts }>> {
  return siteGet<{ orders: GoodsOrderOut[]; counts: GoodsOrderCounts }>("goods/orders", input);
}

/** GET /api/sto/goods/orders/item?shopId&actorUserId&orderId → GoodsOrderOut; чужой заказ — not_found. */
export function fetchGoodsOrder(input: Who & { orderId: number }): Promise<ApiResult<GoodsOrderOut>> {
  return siteGet<GoodsOrderOut>("goods/orders/item", input);
}

/** POST /api/sto/goods/orders/create → GoodsOrderOut (§3.1). */
export function createGoodsOrder(input: Who & CreateGoodsOrderInput): Promise<ApiResult<GoodsOrderOut>> {
  return sitePost<GoodsOrderOut>("goods/orders/create", input);
}

/**
 * POST /api/sto/goods/orders/transition → { order, clientMessage } (§3.2).
 * Тот же статус повторно — 200 без изменений; недопустимый переход — conflict.
 * Покупателю с учёткой сайт шлёт уведомление сам; clientMessage — текст для
 * WhatsApp, который приложение открывает по wa.me.
 */
export function transitionGoodsOrder(input: Who & TransitionGoodsOrderInput): Promise<ApiResult<TransitionGoodsOrderOut>> {
  return sitePost<TransitionGoodsOrderOut>("goods/orders/transition", input);
}

/** POST /api/sto/goods/orders/reserve { orderId, days? 1…14 } → GoodsOrderOut; у закрытого — conflict. */
export function extendGoodsReserve(input: Who & { orderId: number; days?: number }): Promise<ApiResult<GoodsOrderOut>> {
  return sitePost<GoodsOrderOut>("goods/orders/reserve", input);
}

/** POST /api/sto/goods/orders/note { orderId, note (до 500; пустая — убрать) } → GoodsOrderOut */
export function saveGoodsOrderNote(input: Who & { orderId: number; note: string }): Promise<ApiResult<GoodsOrderOut>> {
  return sitePost<GoodsOrderOut>("goods/orders/note", input);
}

export type GoodsItemsOut = { items: GoodsItemOut[]; counts: GoodsItemCounts; categories: GoodsCategoryCount[] };

/**
 * GET /api/sto/goods/items?shopId&actorUserId&view&category → { items, counts, categories }
 * — объявления магазина active и archived, до 500, по названию; counts и
 * categories — по всем, не по виду.
 */
export function fetchGoodsItems(input: Who & { view?: GoodsItemView; category?: string }): Promise<ApiResult<GoodsItemsOut>> {
  return siteGet<GoodsItemsOut>("goods/items", input);
}

/**
 * POST /api/sto/goods/items/stock { listingId, mode?, qty? (0…99 999), lowThreshold? (0…999) } → GoodsItemOut
 * — строка остатка заводится (без mode — count) или правится; возврат на
 * витрину упёрся в близнеца — conflict.
 */
export function saveGoodsStock(input: Who & { listingId: number; mode?: GoodsStockMode; qty?: number; lowThreshold?: number }): Promise<ApiResult<GoodsItemOut>> {
  return sitePost<GoodsItemOut>("goods/items/stock", input);
}

/** POST /api/sto/goods/items/price { listingId, price (1…100 000 000) } → GoodsItemOut */
export function saveGoodsPrice(input: Who & { listingId: number; price: number }): Promise<ApiResult<GoodsItemOut>> {
  return sitePost<GoodsItemOut>("goods/items/price", input);
}

/**
 * POST /api/sto/goods/items/photo — multipart: shopId, actorUserId, file
 * (jpeg/png/webp/heic, до 8 МБ) → { stagedId, url } — кадр в прихожей
 * владельца витрины (24 часа), водяной знак наложен; чаще 20 в минуту —
 * rate_limited. Хозяину.
 */
export function uploadGoodsPhoto(input: Who & { file: File }): Promise<ApiResult<{ stagedId: number; url: string }>> {
  const form = new FormData();
  form.set("shopId", String(input.shopId));
  form.set("actorUserId", input.actorUserId);
  form.set("file", input.file);
  return sitePostForm<{ stagedId: number; url: string }>("goods/items/photo", form);
}

/**
 * POST /api/sto/goods/items/create → GoodsItemOut (§4.1): объявление от
 * учётки владельца витрины + строка остатка + кадры прихожей. Витрина без
 * учётки владельца — conflict «сначала войдите на сайт этим номером». Хозяину.
 */
export function createGoodsItem(input: Who & CreateGoodsItemInput): Promise<ApiResult<GoodsItemOut>> {
  return sitePost<GoodsItemOut>("goods/items/create", input);
}

/** GET /api/sto/goods/clients?shopId&actorUserId&view → { clients, counts } — по последнему заказу, до 1000. */
export function fetchGoodsClients(input: Who & { view?: GoodsClientView }): Promise<ApiResult<{ clients: GoodsClientOut[]; counts: GoodsClientCounts }>> {
  return siteGet<{ clients: GoodsClientOut[]; counts: GoodsClientCounts }>("goods/clients", input);
}

/**
 * POST /api/sto/goods/clients/note { phone, name?, note?, dates? } → GoodsClientOut.
 * Переданные поля перезаписываются, не переданные остаются; все три пустые
 * — строка заметки удаляется, клиент в списке остаётся (он из заказов).
 * Телефона нет среди заказов магазина — not_found.
 */
export function saveGoodsClientNote(input: Who & { phone: string; name?: string; note?: string; dates?: GoodsClientDate[] }): Promise<ApiResult<GoodsClientOut>> {
  return sitePost<GoodsClientOut>("goods/clients/note", input);
}
