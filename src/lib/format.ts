// Подписи для людей: время и деньги по-русски, без библиотек.
import { localDay, localHHMM, STO_TZ_OFFSET } from "@/lib/sto/slots";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const DAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Полдень дня по часам сервиса — точка, от которой считаем день недели и число. */
function noon(day: string): Date {
  return new Date(`${day}T12:00:00${STO_TZ_OFFSET}`);
}

/** «21 сентября, понедельник» для даты YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const d = noon(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${DAYS[d.getUTCDay()]}`;
}

/** «21 сентября» — заголовок дня. */
export function dayTitle(day: string): string {
  const d = noon(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** «вторник, 15 сентября» — надзаголовок карточки смены (день недели первым). */
export function dayEyebrow(day: string): string {
  const d = noon(day);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** «понедельник». */
export function dayOfWeekLabel(day: string): string {
  return DAYS[noon(day).getUTCDay()];
}

/** «пн» — для столбиков недели. */
export function dayOfWeekShort(day: string): string {
  return DAYS_SHORT[noon(day).getUTCDay()];
}

/** Число месяца без ведущего нуля. */
export function dayNumber(day: string): number {
  return noon(day).getUTCDate();
}

/** «21.09» для даты YYYY-MM-DD. */
export function dayShort(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

/** «14 – 20 сентября»; если месяцы разные — «28 сентября – 4 октября». */
export function rangeLabel(from: string, to: string): string {
  const a = noon(from), b = noon(to);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

/** «14:00–15:00» по часам сервиса. */
export function timeRange(startsAt: string | Date, endsAt: string | Date): string {
  return `${localHHMM(new Date(startsAt))}–${localHHMM(new Date(endsAt))}`;
}

export function formatRub(n: number | null | undefined): string {
  if (n == null) return "цена не указана";
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

/** «12 400 ₽» — только число с валютой, для плиток сводки. */
export function rub(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

/** «1 ч 30 мин» — длина услуги и окна. */
export function minutesLabel(n: number): string {
  if (n < 60) return `${n} мин`;
  const h = Math.floor(n / 60), m = n % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** «АК» — две буквы для кружка клиента. Пусто — «—». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const letters = parts.slice(0, 2).map(p => p[0]).join("");
  return letters.toUpperCase();
}

/**
 * «Гурам Б.» — имя для тесных строк списка: фамилия занимает место, а
 * человеку за стойкой хватает имени и первой буквы. Второе слово с
 * маленькой буквы — не фамилия («Клиент с сайта»), такое не трогаем.
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  const surname = parts[1];
  if (surname[0] !== surname[0].toUpperCase()) return name.trim();
  return `${parts[0]} ${surname[0]}.`;
}

/**
 * «+7 940 921-14-08» — телефон, каким его читают вслух. В базе он лежит в
 * E.164 (normalizePhone), а сплошные одиннадцать цифр глазом не разобрать.
 * Чужой формат не ломаем: отдаём как есть.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return phone;
}

/** Дата YYYY-MM-DD, сдвинутая на n дней. */
export function addDays(day: string, n: number): string {
  const d = noon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return localDay(d);
}

export function todayLocal(now: Date = new Date()): string {
  return localDay(now);
}

/** Понедельник недели, куда попадает день. */
export function weekStart(day: string): string {
  const js = noon(day).getUTCDay(); // 0 = вс
  return addDays(day, -((js + 6) % 7));
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «3 поста», «7 записей» — число со словом. */
export function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}

/**
 * Когда это было, глазами человека за стойкой: сегодня — «14 минут назад»
 * и время, вчера — «вчера, 19:02», раньше — «12.09, 19:02».
 */
export function relativeAt(at: string | Date, now: Date = new Date()): string {
  const d = new Date(at);
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  const day = localDay(d);
  if (mins >= 0 && mins < 60) return mins < 1 ? "только что" : `${count(mins, "минуту", "минуты", "минут")} назад`;
  if (day === localDay(now)) return localHHMM(d);
  if (day === addDays(localDay(now), -1)) return `вчера, ${localHHMM(d)}`;
  return `${dayShort(day)}, ${localHHMM(d)}`;
}

/** «сегодня», «вчера», «2 недели», «месяц» — давность последнего визита. */
export function agoLabel(at: string | Date, now: Date = new Date()): string {
  const day = localDay(new Date(at));
  const today = localDay(now);
  if (day === today) return "сегодня";
  if (day === addDays(today, -1)) return "вчера";
  const days = Math.round((noon(today).getTime() - noon(day).getTime()) / 86_400_000);
  if (days < 0) return "впереди";
  if (days < 7) return count(days, "день", "дня", "дней");
  if (days < 31) return count(Math.round(days / 7), "неделя", "недели", "недель");
  if (days < 365) return count(Math.round(days / 30), "месяц", "месяца", "месяцев");
  return count(Math.round(days / 365), "год", "года", "лет");
}
