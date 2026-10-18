/**
 * Свой курьер магазина — строка shops.couriers (jsonb, который пишет кабинет
 * сайта; форма — ShopCourier в src/lib/delivery/types.ts сайта). Нужен
 * одному месту: на «Курьеру» у магазина со своей доставкой сайт требует
 * courierId (контракт goods §3.2), и выбрать его человеку надо из списка.
 */
export type ShopCourier = { id: string; name: string; phone: string };

/** Те же правила, что shopCouriersSchema сайта (src/lib/api-schemas.ts): id — 4…24 латинских букв и цифр, телефон 6…24 знака. */
const ID = /^[a-z0-9]{4,24}$/;

/**
 * Кривое отбрасываем ТЕМ ЖЕ ситом, что сайт: он разбирает колонку zod-схемой
 * и строку, не прошедшую её, не видит вовсе. Покажи мы такого курьера — сайт
 * ответил бы «выберите курьера» на уже выбранного (поймано на стенде
 * 18.10.2026 с id «c1»).
 */
export function parseCouriers(raw: unknown): ShopCourier[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopCourier[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, name, phone } = r as Record<string, unknown>;
    if (typeof id !== "string" || !ID.test(id.trim())) continue;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60) continue;
    if (typeof phone !== "string" || phone.trim().length < 6 || phone.trim().length > 24) continue;
    out.push({ id: id.trim(), name: name.trim(), phone: phone.trim() });
  }
  return out.slice(0, 20);
}
