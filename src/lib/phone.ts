/** Телефон к E.164 (+7…): как normalizePhone на сайте — цифры, ведущая 8 → +7. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (d.length < 7 || d.length > 15) return null;
  return "+" + d;
}

/**
 * Целиком E.164: «+» и 11–15 цифр — как isValidE164 на сайте. Только такой
 * номер можно подставлять в фильтр PostgREST: ничего, кроме плюса и цифр.
 */
export function isValidE164(phone: string | null | undefined): phone is string {
  return typeof phone === "string" && /^\+\d{11,15}$/.test(phone);
}
