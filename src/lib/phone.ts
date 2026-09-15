/** Телефон к E.164 (+7…): как normalizePhone на сайте — цифры, ведущая 8 → +7. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (d.length < 7 || d.length > 15) return null;
  return "+" + d;
}
