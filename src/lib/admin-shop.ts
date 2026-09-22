// Кодек куки админ-контекста: витрина, в которую вошёл админ сайта через
// /admin-vhod (спека abkhaz-auto 2026-09-22-sto-admin-access, зеркало — в
// docs/API-sushchnosti.md). Файл без server-only — тем же делением, что
// role-view.ts / role-cookie.ts: чистый разбор тестируется юнитом, чтение и
// запись самой куки живут в admin-shop-cookie.ts.
//
// Кука сама по себе прав не даёт: is_admin перечитывается из базы на каждый
// запрос (lib/shop.ts), подделка значения без прав ничего не открывает.

export const ADMIN_SHOP_COOKIE = "sto-admin-shop";

/** В куке — только номер витрины и учётка: ни телефонов, ни имён. */
export function serializeAdminShop(shopId: number, userId: string): string {
  return `${shopId}|${userId}`;
}

/** shopId из куки — или null, когда кука чужая, пустая или испорчена. */
export function parseAdminShop(raw: string | undefined | null, userId: string): number | null {
  if (!raw) return null;
  const [shop, uid] = raw.split("|");
  if (uid !== userId) return null;
  const id = Number(shop);
  return Number.isInteger(id) && id > 0 ? id : null;
}
