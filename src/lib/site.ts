/** Адреса сайта — в одном месте, чтобы не собирать строку в каждом экране. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://abkhaz-auto.ru").replace(/\/$/, "");
}

/** Кабинет витрины сервиса на сайте: там заводят услуги, товары и типовой прайс.
 *
 *  Параметр вкладки — ИМЕННО `obyavleniya`. У редактора витрины ключ вкладки и
 *  её параметр в адресе разные: ключ `listings`, параметр `obyavleniya`
 *  (abkhaz-auto, src/app/lk/magaziny/[id]/vitrina/page.tsx, editorTabs). Разбор
 *  неизвестного значения молча возвращает «Основные», поэтому со старым
 *  `tab=listings` владелец попадал не на свои объявления, а на общие настройки
 *  и решал, что товар не появился (жалоба владельца 16.09.2026). */
export function shopStorefrontUrl(shopId: number): string {
  return `${siteUrl()}/lk/magaziny/${shopId}/vitrina?tab=obyavleniya`;
}
