/** Адреса сайта — в одном месте, чтобы не собирать строку в каждом экране. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://abkhaz-auto.ru").replace(/\/$/, "");
}

/** Кабинет витрины сервиса на сайте: там заводят услуги и типовой прайс. */
export function shopStorefrontUrl(shopId: number): string {
  return `${siteUrl()}/lk/magaziny/${shopId}/vitrina?tab=listings`;
}
