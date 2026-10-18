// Подписи экрана «Сегодня» магазина: подписка, витрина, реклама, месяц.
// Цифры считает сайт (GoodsTodayOut), здесь — только слова к ним. Чисто.
import type { GoodsTodayOut } from "@/lib/api/goods";
import { count, dayShort, rub } from "@/lib/format";
import type { Tone } from "@/lib/goods/orders";
import { localDay } from "@/lib/sto/slots";

type Subscription = GoodsTodayOut["subscription"];

/** «до 24.10 · ещё 6 дней», «истекла 10.10», «до 18.10 · кончается сегодня», «срок не задан». */
export function subscriptionLine(sub: Subscription): string {
  if (!sub.until) return "срок не задан";
  const until = dayShort(sub.until);
  if (sub.expired) return `истекла ${until}`;
  if (sub.daysLeft === 0) return `до ${until} · кончается сегодня`;
  if (sub.daysLeft != null) return `до ${until} · ещё ${count(sub.daysLeft, "день", "дня", "дней")}`;
  return `до ${until}`;
}

/** Неделя до конца — янтарный, истекла — красный: напоминание, а не паника. */
export function subscriptionTone(sub: Subscription): Tone {
  if (sub.expired) return "dng";
  if (sub.daysLeft != null && sub.daysLeft <= 7) return "warn";
  return "ok";
}

export const STOREFRONT_LABEL: Record<GoodsTodayOut["shop"]["storefront"], string> = {
  off: "витрина не опубликована",
  requested: "витрина на проверке",
  published: "витрина опубликована",
  hidden: "витрина скрыта",
};

/** Регионы площадки по слагу — подпись «Сухум», а не «sukhum». Чужой слаг — как есть. */
const REGION: Record<string, string> = {
  sukhum: "Сухум", gagra: "Гагра", gudauta: "Гудаута", pitsunda: "Пицунда", "novyi-afon": "Новый Афон",
  ochamchira: "Очамчира", tkuarchal: "Ткуарчал", gal: "Гал", gulripsh: "Гулрыпш",
};

export function regionLabel(slug: string): string {
  return REGION[slug] ?? slug;
}

/** «Сухум · витрина опубликована». */
export function storefrontLine(shop: GoodsTodayOut["shop"]): string {
  return [shop.regionSlug ? regionLabel(shop.regionSlug) : null, STOREFRONT_LABEL[shop.storefront]].filter(Boolean).join(" · ");
}

const AD_STATUS: Record<string, string> = { active: "идёт", paused: "на паузе", pending: "на проверке", finished: "завершена" };

/** «идёт · остаток 420 ₽ · хватит на 1 день». */
export function adsLine(ads: NonNullable<GoodsTodayOut["ads"]>): string {
  const parts = [AD_STATUS[ads.status] ?? ads.status, `остаток ${rub(ads.balance)}`];
  if (ads.daysLeft != null) parts.push(`хватит на ${count(ads.daysLeft, "день", "дня", "дней")}`);
  return parts.join(" · ");
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/**
 * «октябрь» для начала месяца. Сайт отдаёт from меткой времени
 * («2026-09-30T21:00:00.000Z» — это 1 октября 00:00 по часам магазина),
 * поэтому день берём по часам магазина, а не из первых символов строки.
 */
export function monthLabel(from: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : localDay(new Date(from));
  const m = Number(day.slice(5, 7));
  return MONTHS[m - 1] ?? from;
}

/** «2 доставки · 3 самовывоз» — расшифровка «на сегодня». */
export function todaySplit(orders: GoodsTodayOut["orders"]): string {
  return `${count(orders.todayCourier, "доставка", "доставки", "доставок")} · ${orders.todayPickup} самовывоз`;
}
