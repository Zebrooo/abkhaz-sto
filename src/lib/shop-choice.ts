// Кодек куки выбранной витрины. Один человек всё чаще владеет и сервисом, и
// магазином товаров (один номер — две витрины), а приложение рисует одну.
// Выбор живёт в куке, а не в адресе, по тем же причинам, что примерка роли
// (lib/role-view.ts): гейты и действия уводят на свои экраны, и параметр в
// адресе терялся бы на первом же переходе. Файл без server-only — тем же
// делением, что admin-shop.ts: чистый разбор под юнитом, сама кука —
// в shop-cookie.ts.
//
// Кука прав не даёт: витрина из неё берётся только из списка доступных
// человеку (lib/shop.ts), чужой номер в куке — как будто куки нет.

export const SHOP_COOKIE = "sto-shop";

/** В куке — только номер витрины и учётка: ни телефонов, ни имён. */
export function serializeShopChoice(shopId: number, userId: string): string {
  return `${shopId}|${userId}`;
}

/** shopId из куки — или null, когда кука чужая, пустая или испорчена. */
export function parseShopChoice(raw: string | undefined | null, userId: string): number | null {
  if (!raw) return null;
  const [shop, uid] = raw.split("|");
  if (uid !== userId) return null;
  const id = Number(shop);
  return Number.isInteger(id) && id > 0 ? id : null;
}
