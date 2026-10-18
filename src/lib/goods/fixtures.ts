// Образцы ответов сайта для тестов правил экранов — цифры и имена с артборда
// «СРМ владельца» и из §3.3 контракта. Без server-only: тесты чистых модулей
// импортируют их напрямую. В продакшен-код не попадают.
import type { GoodsClientOut, GoodsItemOut, GoodsOrderOut, GoodsTodayOut } from "@/lib/api/goods";

/** «Сейчас» для тестов: 18.10.2026, 09:30 по часам магазина (+03:00). */
export const NOW = new Date("2026-10-18T09:30:00+03:00");

const base: Omit<GoodsOrderOut, "id" | "number" | "items" | "buyer" | "goods"> = {
  source: "storefront",
  status: "new",
  createdAt: "2026-10-18T06:26:00.000Z",
  updatedAt: "2026-10-18T06:26:00.000Z",
  method: "courier",
  city: "sukhum",
  address: null,
  slot: null,
  comment: null,
  payment: "online",
  paidAt: "2026-10-18T06:26:00.000Z",
  subtotal: 0,
  delivery: 0,
  total: 0,
  courier: null,
  pickup: null,
  ownDelivery: true,
  dueAt: null,
  reserveUntil: null,
  reserveExpired: false,
  clientOrdersCount: 1,
  next: ["assembling", "cancelled"],
};

const goodsNone: GoodsOrderOut["goods"] = {
  vertical: "general", recipient: null, deliveryDate: null, window: null, card: null, composition: null, readyBy: null, note: null,
};

/** Цветы с витрины: новый, доставка завтра 10–12, открытка, оплачен онлайн. */
export const ORDER_FLOWERS: GoodsOrderOut = {
  ...base,
  id: 1042,
  number: "1 042",
  address: "ул. Лакоба 24",
  slot: "19.10 · 10:00–12:00",
  subtotal: 8900,
  delivery: 300,
  total: 9200,
  items: [{ listingId: 5001, slug: "korzina-s-pionami", title: "Корзина с пионами", price: 8900, qty: 1, img: "https://cdn.example/pion.webp", serial: null, warrantyMonths: null }],
  buyer: { name: "Мадина Хагба", phone: "+79401112233", hasAccount: true },
  dueAt: "2026-10-19T07:00:00.000Z",
  goods: {
    vertical: "flowers",
    recipient: { name: "Мадина Хагба", phone: "+79401112233" },
    deliveryDate: "2026-10-19",
    window: { from: "10:00", to: "12:00" },
    card: "С днём рождения, мама",
    composition: "средняя · 15 пионов, эвкалипт",
    readyBy: null,
    note: null,
  },
  clientOrdersCount: 2,
};

/** Электроника с витрины — §3.3 контракта: самовывоз, резерв до 20.10. */
export const ORDER_ELECTRONICS: GoodsOrderOut = {
  ...base,
  id: 318,
  number: "318",
  createdAt: "2026-10-18T09:05:00.000Z",
  updatedAt: "2026-10-18T09:05:00.000Z",
  method: "pickup",
  city: "gagra",
  paidAt: "2026-10-18T09:05:00.000Z",
  subtotal: 54990,
  total: 54990,
  items: [{ listingId: 7701, slug: "lenovo-ideapad-3-15-abc12", title: "Ноутбук Lenovo IdeaPad 3 15\"", price: 54990, qty: 1, img: "https://cdn.example/cover.webp", serial: null, warrantyMonths: 12 }],
  buyer: { name: "Астамур Квициния", phone: "+79404445566", hasAccount: true },
  pickup: { address: "Гагра, пр. Ардзинба 10", hours: "10:00–20:00" },
  ownDelivery: false,
  reserveUntil: "2026-10-20T17:00:00.000Z",
  goods: { ...goodsNone, vertical: "electronics" },
};

/** По телефону, готов к выдаче сегодня 13:30, оплата при получении. */
export const ORDER_PHONE_READY: GoodsOrderOut = {
  ...base,
  id: 1040,
  number: "1 040",
  source: "phone",
  status: "ready",
  createdAt: "2026-10-17T15:00:00.000Z",
  updatedAt: "2026-10-18T06:00:00.000Z",
  method: "pickup",
  payment: "on_receipt",
  paidAt: null,
  subtotal: 6250,
  total: 6250,
  items: [{ listingId: 5002, slug: "rozy-60", title: "25 роз 60 см", price: 250, qty: 25, img: null, serial: null, warrantyMonths: null }],
  buyer: { name: "Саид Джинджолия", phone: "+79403334455", hasAccount: false },
  pickup: { address: "Сухум, ул. Айдгылара 3", hours: "09:00–20:00" },
  dueAt: "2026-10-18T10:30:00.000Z",
  goods: { ...goodsNone, vertical: "flowers" },
  clientOrdersCount: 3,
  next: ["delivered", "cancelled"],
};

/** По телефону, принят, собрать к 10:00, доставка сегодня 11:00, оплачен переводом. */
export const ORDER_ASSEMBLING: GoodsOrderOut = {
  ...base,
  id: 1041,
  number: "1 041",
  source: "phone",
  status: "assembling",
  createdAt: "2026-10-18T05:40:00.000Z",
  updatedAt: "2026-10-18T05:50:00.000Z",
  address: "ул. Лакоба 24",
  payment: "transfer",
  paidAt: "2026-10-18T05:55:00.000Z",
  subtotal: 3500,
  total: 3500,
  items: [{ listingId: 5003, slug: "buket-nezhnost", title: "Букет «Нежность»", price: 3500, qty: 1, img: null, serial: null, warrantyMonths: null }],
  buyer: { name: "Амра Чанба", phone: "+79402223344", hasAccount: false },
  dueAt: "2026-10-18T08:00:00.000Z",
  goods: { ...goodsNone, vertical: "flowers", readyBy: "2026-10-18T07:00:00.000Z" },
  next: ["ready", "shipping", "cancelled"],
};

const itemBase = { categorySlug: "kompyutery", categoryLabel: "Ноутбуки", visibility: "visible" as const, updatedAt: "2026-10-18T06:00:00.000Z" };

export const ITEM_LAPTOP: GoodsItemOut = {
  ...itemBase,
  listingId: 7701, slug: "lenovo-ideapad-3-15-abc12", title: "Lenovo IdeaPad 3 15\"", description: "Ryzen 5 · 16/512 · серый",
  price: 54990, img: "https://cdn.example/cover.webp",
  stock: { mode: "count", qty: 3, reserved: 1, available: 2, lowThreshold: 1, low: false },
};

export const ITEM_PHONE_LOW: GoodsItemOut = {
  ...itemBase,
  listingId: 7702, slug: "iphone-15-128", title: "iPhone 15 128 ГБ", description: "чёрный · новый · гарантия 12 мес",
  categorySlug: "elektronika", categoryLabel: "Телефоны", price: 72900, img: null,
  stock: { mode: "count", qty: 1, reserved: 0, available: 1, lowThreshold: 1, low: true },
};

export const ITEM_HIDDEN: GoodsItemOut = {
  ...itemBase,
  listingId: 7703, slug: "xiaomi-redmi-note-13", title: "Xiaomi Redmi Note 13", description: null,
  categorySlug: "elektronika", categoryLabel: "Телефоны", price: 18990, img: null, visibility: "hidden_stock",
  stock: { mode: "count", qty: 0, reserved: 0, available: 0, lowThreshold: 1, low: true },
};

export const ITEM_NO_STOCK: GoodsItemOut = {
  ...itemBase,
  listingId: 5003, slug: "buket-nezhnost", title: "Букет «Нежность»", description: "пионы, эвкалипт",
  categorySlug: "raznoye", categoryLabel: "Разное", price: 3500, img: null, stock: null,
};

export const ITEM_TODAY: GoodsItemOut = {
  ...itemBase,
  listingId: 5004, slug: "tyulpany", title: "Монобукет тюльпаны", description: null,
  categorySlug: "raznoye", categoryLabel: "Разное", price: 2400, img: null,
  stock: { mode: "today", qty: 0, reserved: 0, available: 0, lowThreshold: 1, low: false },
};

export const CLIENT_MADINA: GoodsClientOut = {
  phone: "+79401112233", name: "Мадина Хагба", ordersCount: 2, closedCount: 1, totalClosed: 17400,
  firstAt: "2026-03-07T10:00:00.000Z", lastAt: "2026-10-18T06:26:00.000Z", lastStatus: "new", hasAccount: true,
  note: "Любит пионы. Открытка от руки.",
  dates: [{ label: "день рождения мамы", day: "10-19", kind: "holiday" }],
  segments: ["holiday_soon"],
  nextDate: { label: "день рождения мамы", day: "10-19", inDays: 1 },
  warrantyEndsAt: null,
};

export const CLIENT_REGULAR: GoodsClientOut = {
  phone: "+79402223344", name: "Амра Чанба", ordersCount: 7, closedCount: 6, totalClosed: 24300,
  firstAt: "2025-11-01T10:00:00.000Z", lastAt: "2026-10-18T05:40:00.000Z", lastStatus: "assembling", hasAccount: false,
  note: "", dates: [], segments: ["regular"], nextDate: null, warrantyEndsAt: null,
};

export const CLIENT_DORMANT: GoodsClientOut = {
  phone: "+79405556677", name: "Тимур Папба", ordersCount: 1, closedCount: 1, totalClosed: 2400,
  firstAt: "2026-06-15T10:00:00.000Z", lastAt: "2026-06-15T10:00:00.000Z", lastStatus: "delivered", hasAccount: false,
  note: "", dates: [], segments: ["dormant"], nextDate: null, warrantyEndsAt: null,
};

export const CLIENT_WARRANTY: GoodsClientOut = {
  phone: "+79404445566", name: "Астамур Квициния", ordersCount: 1, closedCount: 1, totalClosed: 54990,
  firstAt: "2025-11-02T10:00:00.000Z", lastAt: "2025-11-02T10:00:00.000Z", lastStatus: "delivered", hasAccount: true,
  note: "", dates: [{ label: "предложить апгрейд", day: "12-01", kind: "upgrade_offered" }], segments: ["warranty_ending"],
  nextDate: { label: "предложить апгрейд", day: "12-01", inDays: 44 }, warrantyEndsAt: "2026-11-02T10:00:00.000Z",
};

export const TODAY: GoodsTodayOut = {
  shop: { id: 9, name: "Цветы «Лилия»", slug: "liliya", vertical: "flowers", regionSlug: "sukhum", storefront: "published", storefrontUrl: "https://abkhaz-auto.ru/m/liliya" },
  subscription: { until: "2026-10-24", daysLeft: 6, expired: false },
  orders: { new: 3, overdueNew: 0, today: 5, todayCourier: 2, todayPickup: 3 },
  slaNewHours: 0.25,
  storefront7d: { views: 412, phoneReveals: 31 },
  month: { from: "2026-10-01", revenue: 86400, closed: 23 },
  upcoming: [ORDER_ASSEMBLING, ORDER_PHONE_READY, ORDER_FLOWERS],
  ads: { campaignId: 5, title: "Букеты с доставкой", status: "active", balance: 420, spent7d: 2100, daysLeft: 1 },
};
