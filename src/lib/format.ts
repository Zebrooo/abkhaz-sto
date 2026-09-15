// Подписи для людей: время и деньги по-русски, без библиотек.
import { localDay, localHHMM } from "@/lib/sto/slots";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

/** «21 сентября, понедельник» для даты YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00+03:00`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${DAYS[d.getUTCDay()]}`;
}

/** «21.09» для даты YYYY-MM-DD. */
export function dayShort(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

/** «14:00–15:00» по часам сервиса. */
export function timeRange(startsAt: string | Date, endsAt: string | Date): string {
  return `${localHHMM(new Date(startsAt))}–${localHHMM(new Date(endsAt))}`;
}

export function formatRub(n: number | null | undefined): string {
  if (n == null) return "цена не указана";
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

/** Дата YYYY-MM-DD, сдвинутая на n дней. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return localDay(d);
}

export function todayLocal(now: Date = new Date()): string {
  return localDay(now);
}

/** Понедельник недели, куда попадает день. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00+03:00`);
  const js = d.getUTCDay(); // 0 = вс
  return addDays(day, -((js + 6) % 7));
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
