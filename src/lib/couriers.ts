/**
 * Свой курьер магазина — строка shops.couriers (jsonb, который пишет кабинет
 * сайта; форма — ShopCourier в src/lib/delivery/types.ts сайта). Нужен
 * одному месту: на «Курьеру» у магазина со своей доставкой сайт требует
 * courierId (контракт goods §3.2), и выбрать его человеку надо из списка.
 */
export type ShopCourier = { id: string; name: string; phone: string | null };

/** Кривое отбрасываем: колонку пишет кабинет сайта, и верить её форме нельзя. */
export function parseCouriers(raw: unknown): ShopCourier[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopCourier[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, name, phone } = r as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) continue;
    out.push({ id, name: name.trim(), phone: typeof phone === "string" && phone ? phone : null });
  }
  return out;
}
