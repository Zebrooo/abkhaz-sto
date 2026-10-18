// Правила экрана «Товары»: пилюля остатка, подпись видимости, поиск. Товар —
// объявление Маркета плюс строка остатка на сайте (контракт goods §4);
// приложение только показывает и правит остаток с ценой. Чисто, под тестом.
import type { GoodsItemOut, GoodsItemView, GoodsStockMode, GoodsVisibility } from "@/lib/api/goods";
import type { PillSpec } from "@/lib/goods/orders";

export const ITEM_VIEW_LABEL: Record<GoodsItemView, string> = { all: "Все", low: "Кончаются", hidden: "Скрыто" };

export const STOCK_MODE_LABEL: Record<GoodsStockMode, string> = {
  count: "Считаем штуки", today: "Есть сегодня", on_order: "Под заказ",
};

/**
 * Остаток одной пилюлей — как на артборде: «2 шт», «1 шт · кончается»,
 * «0 шт · скрыт с витрины»; у цветов вместо счёта — «есть сегодня» и
 * «под заказ». Без строки остатка — честное «остаток не ведётся»: товар
 * виден, но считать нечего.
 */
export function stockPill(item: GoodsItemOut): PillSpec {
  const s = item.stock;
  if (!s) return { text: "остаток не ведётся", tone: "neu" };
  if (s.mode === "today") return { text: "есть сегодня", tone: "ok" };
  if (s.mode === "on_order") return { text: "под заказ", tone: "neu" };
  if (s.available <= 0) return { text: item.visibility === "hidden_stock" ? "0 шт · скрыт с витрины" : "0 шт", tone: "neu" };
  if (s.low) return { text: `${s.available} шт · кончается`, tone: "dng" };
  return { text: `${s.available} шт`, tone: "ok" };
}

/** «1 в резерве» — в активных заказах; нет резерва — пилюли нет. */
export function reservePill(item: GoodsItemOut): PillSpec | null {
  const r = item.stock?.reserved ?? 0;
  return r > 0 ? { text: `${r} в резерве`, tone: "neu" } : null;
}

export const VISIBILITY_SHORT: Record<GoodsVisibility, string> = {
  visible: "на витрине",
  hidden_stock: "скрыт · нет остатка",
  hidden_owner: "скрыт владельцем",
  hidden_moderation: "снят модерацией",
};

/** Что с видимостью и что с этим делать — подпись в шторке правки. */
export function visibilityLine(item: GoodsItemOut): string {
  switch (item.visibility) {
    case "visible": return "На витрине. Остаток 0 снимет товар сам, больше нуля — вернёт.";
    case "hidden_stock": return "Скрыт с витрины остатком 0 — вернётся сам, как только остаток станет больше нуля.";
    case "hidden_owner": return "Снят владельцем или сроком жизни объявления — остатком не вернуть, только в кабинете сайта.";
    case "hidden_moderation": return "Снят модерацией — вернёт только поддержка площадки.";
  }
}

/** Поиск по названию, описанию, разделу и слагу. */
export function matchItem(item: GoodsItemOut, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.description ?? "", item.categoryLabel, item.slug].join(" ").toLowerCase().includes(needle);
}
