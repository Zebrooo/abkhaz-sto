// Сетка месяца для маленького календаря. Чистые правила над строками
// «YYYY-MM-DD» — ни Date в пропсах, ни часовых поясов на экране: день
// сервиса везде одна и та же строка (lib/sto/slots.ts).
//
// Почему не библиотека: всё, что нужно календарику, — это «какие дни в
// месяце» и «с какого дня недели он начинается». Две функции против лишней
// зависимости в бандле, которую придётся тащить в браузер.
import { addDays } from "@/lib/format";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** Полдень UTC — тот же приём, что в lib/format.ts: сдвиг часов не меняет дату. */
function noon(day: string): Date {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`);
}

/** «2026-09-21» → «2026-09». */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** «2026-09» → «Сентябрь 2026». */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[Math.min(11, Math.max(0, (m || 1) - 1))]} ${y}`;
}

/** Первый день месяца строкой. */
export function monthFirst(month: string): string {
  return `${month}-01`;
}

/** «2026-09» + n месяцев. Переход через год считает сам Date. */
export function addMonths(month: string, n: number): string {
  const d = noon(monthFirst(month));
  d.setUTCMonth(d.getUTCMonth() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Месяц дня, проверенный: мусор из адреса превращается в месяц опорного дня. */
export function safeMonth(raw: string | undefined | null, fallbackDay: string): string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? "") ? (raw as string) : monthOf(fallbackDay);
}

export type MonthCell = { day: string; inMonth: boolean };

/**
 * Шесть строк по семь дней, с понедельника. Соседние месяцы тоже отдаём —
 * иначе сетка «поедет» и клетки первой недели окажутся пустыми дырами, по
 * которым нельзя ткнуть в 31 августа, стоя в сентябре.
 */
export function monthGrid(month: string): MonthCell[] {
  const first = monthFirst(month);
  // getUTCDay: 0 — воскресенье, а неделя у нас с понедельника.
  const shift = (noon(first).getUTCDay() + 6) % 7;
  const start = addDays(first, -shift);
  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    return { day, inMonth: monthOf(day) === month };
  });
}
