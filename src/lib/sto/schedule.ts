// ⚠ КОПИЯ из abkhaz-auto (src/lib/sto/). Источник истины — там, вместе с
// миграциями; правки вносить в обоих репозиториях одним и тем же текстом.
// Запись на СТО: расписание сервиса и предоплата — форма jsonb в
// shops.sto_schedule и shops.sto_prepay (20260915063709) и их проверка.
//
// Две функции на каждую форму, как у окон доставки (lib/market/slots-validate
// и lib/delivery normalizeSlots): validate* — для сохранения из формы, любая
// неточность отказ с понятной строкой и номером; normalize* — для чтения из
// базы, кривая запись чинится молча, а расписание, из которого окон не
// собрать, превращается в null («не задано»).
//
// Времена — по часам сервиса; вся Абхазия в одном поясе (Europe/Moscow), и
// база хранит записи в timestamptz, поэтому пояс живёт в расчёте окон, а не
// здесь.

export const STO_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type StoDay = (typeof STO_DAYS)[number];

export const STO_DAY_LABEL: Record<StoDay, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
};

/** Интервал приёма «09:00–13:00»; перерыв — это просто два интервала в дне. */
export type StoInterval = { from: string; to: string };

export type StoSchedule = {
  /** По дням недели; пустой список — выходной. */
  days: Record<StoDay, StoInterval[]>;
  /** Постов (подъёмников) — столько записей может идти одновременно. */
  posts: number;
  /** Шаг сетки окон, минут. */
  stepMin: number;
  /**
   * Буфер между записями, минут: столько пост остаётся занят ПОСЛЕ конца
   * записи — мастер закрывает работу и принимает следующую машину. Живёт
   * только в расчёте окон (slots.ts): в базе запись по-прежнему
   * [starts_at, ends_at) без буфера. 0 — окна идут минута в минуту; записи
   * в базе без поля (до появления буфера) читаются как 0.
   */
  bufferMin: number;
  /** Разовые выходные и праздники, ISO-даты YYYY-MM-DD. */
  daysOff: string[];
};

export const MAX_STO_POSTS = 20;
/** Интервалов в одном дне — больше не бывает: работа, обед, вечер, с запасом. */
export const MAX_STO_INTERVALS_PER_DAY = 4;
export const MAX_STO_DAYS_OFF = 366;
export const STO_STEPS_MIN = [15, 20, 30, 60] as const;
export const DEFAULT_STO_STEP_MIN = 30;
/** Буфер — из короткого списка, как шаг: сегмент в расписании, а не поле ввода. */
export const STO_BUFFERS_MIN = [0, 10, 15, 20] as const;
export const DEFAULT_STO_BUFFER_MIN = 0;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Конец интервала может быть «24:00» — смена до полуночи; начало — нет. */
const TIME_TO_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Дата существует (2026-02-31 — нет): разбор через UTC и обратная сверка. */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type StoScheduleValidation =
  | { ok: true; schedule: StoSchedule }
  | { ok: false; error: string };

/**
 * Разбор расписания из формы: формат ЧЧ:ММ, начало раньше конца, интервалы
 * дня не пересекаются (стык «до 13:00» / «с 13:00» — не пересечение), не
 * больше MAX_STO_INTERVALS_PER_DAY, хотя бы один рабочий день, посты 1…20,
 * шаг из STO_STEPS_MIN, буфер из STO_BUFFERS_MIN (нет поля — 0), выходные —
 * уникальные ISO-даты. Интервалы дня возвращаются по порядку начала.
 */
export function validateStoSchedule(raw: unknown): StoScheduleValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Расписание не заполнено" };
  const r = raw as Partial<Record<keyof StoSchedule, unknown>>;
  const daysRaw = r.days && typeof r.days === "object" && !Array.isArray(r.days) ? (r.days as Record<string, unknown>) : {};
  const days = {} as Record<StoDay, StoInterval[]>;
  let openDays = 0;
  for (const day of STO_DAYS) {
    const list = daysRaw[day];
    if (list == null) { days[day] = []; continue; }
    if (!Array.isArray(list)) return { ok: false, error: `${STO_DAY_LABEL[day]}: часы работы — список интервалов` };
    if (list.length > MAX_STO_INTERVALS_PER_DAY) return { ok: false, error: `${STO_DAY_LABEL[day]}: не больше ${MAX_STO_INTERVALS_PER_DAY} интервалов в день` };
    const parsed: (StoInterval & { n: number })[] = [];
    for (const [i, it] of (list as Partial<StoInterval>[]).entries()) {
      const n = i + 1;
      if (!it || typeof it !== "object") return { ok: false, error: `${STO_DAY_LABEL[day]}, интервал ${n}: пустая запись` };
      const from = typeof it.from === "string" ? it.from.trim() : "";
      const to = typeof it.to === "string" ? it.to.trim() : "";
      if (!TIME_RE.test(from)) return { ok: false, error: `${STO_DAY_LABEL[day]}, интервал ${n}: начало в формате ЧЧ:ММ, например 09:00` };
      if (!TIME_TO_RE.test(to)) return { ok: false, error: `${STO_DAY_LABEL[day]}, интервал ${n}: конец в формате ЧЧ:ММ, например 18:00 (до полуночи — 24:00)` };
      if (toMinutes(from) >= toMinutes(to)) return { ok: false, error: `${STO_DAY_LABEL[day]}, интервал ${n}: начало ${from} должно быть раньше конца ${to}` };
      parsed.push({ from, to, n });
    }
    const sorted = [...parsed].sort((a, b) => toMinutes(a.from) - toMinutes(b.from) || a.n - b.n);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (toMinutes(cur.from) < toMinutes(prev.to)) {
        return { ok: false, error: `${STO_DAY_LABEL[day]}: интервал ${cur.n} (${cur.from}–${cur.to}) пересекается с интервалом ${prev.n} (${prev.from}–${prev.to})` };
      }
    }
    days[day] = sorted.map(({ from, to }) => ({ from, to }));
    if (sorted.length > 0) openDays++;
  }
  if (openDays === 0) return { ok: false, error: "Нужен хотя бы один рабочий день" };

  const posts = Number(r.posts);
  if (!Number.isInteger(posts) || posts < 1 || posts > MAX_STO_POSTS) {
    return { ok: false, error: `Постов — целое число от 1 до ${MAX_STO_POSTS}` };
  }
  const stepMin = r.stepMin == null ? DEFAULT_STO_STEP_MIN : Number(r.stepMin);
  if (!(STO_STEPS_MIN as readonly number[]).includes(stepMin)) {
    return { ok: false, error: `Шаг сетки — ${STO_STEPS_MIN.join(", ")} минут` };
  }
  // Нет поля — 0, а не отказ: расписания, сохранённые до появления буфера,
  // обязаны читаться из базы как прежде (normalize иначе закрыл бы запись).
  const bufferMin = r.bufferMin == null ? DEFAULT_STO_BUFFER_MIN : Number(r.bufferMin);
  if (!(STO_BUFFERS_MIN as readonly number[]).includes(bufferMin)) {
    return { ok: false, error: `Буфер между записями — нет, ${STO_BUFFERS_MIN.slice(1).join(", ")} минут` };
  }
  const daysOffRaw = r.daysOff == null ? [] : r.daysOff;
  if (!Array.isArray(daysOffRaw)) return { ok: false, error: "Выходные — список дат" };
  if (daysOffRaw.length > MAX_STO_DAYS_OFF) return { ok: false, error: `Выходных — не больше ${MAX_STO_DAYS_OFF}` };
  const daysOff: string[] = [];
  for (const [i, d] of daysOffRaw.entries()) {
    const s = typeof d === "string" ? d.trim() : "";
    if (!isRealDate(s)) return { ok: false, error: `Выходной ${i + 1}: настоящая дата в формате ГГГГ-ММ-ДД` };
    if (!daysOff.includes(s)) daysOff.push(s);
  }
  daysOff.sort();
  return { ok: true, schedule: { days, posts, stepMin, bufferMin, daysOff } };
}

/**
 * Расписание из базы для расчёта окон: то же правило, что у формы, но без
 * слов — кривая запись даёт null («не задано»), и записаться нельзя. Чинить
 * молча здесь нечего: неверное расписание опаснее отсутствующего.
 */
export function normalizeStoSchedule(raw: unknown): StoSchedule | null {
  const v = validateStoSchedule(raw);
  return v.ok ? v.schedule : null;
}

// ── Предоплата ──────────────────────────────────────────────────────────────

export type StoPrepay =
  | { mode: "off" }
  | { mode: "fixed"; amount: number; freeCancelHours: number }
  | { mode: "percent"; percent: number; freeCancelHours: number };

export const STO_PREPAY_OFF: StoPrepay = { mode: "off" };
export const MAX_STO_PREPAY_AMOUNT = 100_000;
/** Срок бесплатной отмены, часов до записи: 0 — отменять можно до самого начала. */
export const MAX_STO_FREE_CANCEL_HOURS = 168;
export const DEFAULT_STO_FREE_CANCEL_HOURS = 24;

export type StoPrepayValidation = { ok: true; prepay: StoPrepay } | { ok: false; error: string };

export function validateStoPrepay(raw: unknown): StoPrepayValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Предоплата не заполнена" };
  const r = raw as { mode?: unknown; amount?: unknown; percent?: unknown; freeCancelHours?: unknown };
  if (r.mode === "off") return { ok: true, prepay: STO_PREPAY_OFF };
  if (r.mode !== "fixed" && r.mode !== "percent") return { ok: false, error: "Предоплата: выключена, фиксированная сумма или процент" };
  const hours = r.freeCancelHours == null ? DEFAULT_STO_FREE_CANCEL_HOURS : Number(r.freeCancelHours);
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_STO_FREE_CANCEL_HOURS) {
    return { ok: false, error: `Срок бесплатной отмены — целое число часов от 0 до ${MAX_STO_FREE_CANCEL_HOURS}` };
  }
  if (r.mode === "fixed") {
    const amount = Number(r.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_STO_PREPAY_AMOUNT) {
      return { ok: false, error: `Сумма предоплаты — целое число рублей от 1 до ${MAX_STO_PREPAY_AMOUNT}` };
    }
    return { ok: true, prepay: { mode: "fixed", amount, freeCancelHours: hours } };
  }
  const percent = Number(r.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return { ok: false, error: "Процент предоплаты — целое число от 1 до 100" };
  }
  return { ok: true, prepay: { mode: "percent", percent, freeCancelHours: hours } };
}

/** Предоплата из базы: кривая запись — выключено, а не сломанная оплата. */
export function normalizeStoPrepay(raw: unknown): StoPrepay {
  const v = validateStoPrepay(raw);
  return v.ok ? v.prepay : STO_PREPAY_OFF;
}

/**
 * Сумма предоплаты за услугу, ₽; 0 — не брать. Округление вверх до рубля.
 * Предоплата только в рублях: кошелёк сайта и ledger рублёвые, а сумма
 * в базе — целые рубли без валюты. Услуга в другой валюте предоплаты не
 * получает (находка ревью #1278): подставить число из одной валюты как
 * сумму в другой хуже, чем не взять предоплату вовсе.
 */
export function stoPrepayAmount(prepay: StoPrepay, service: { price: number | null; currency: string }): number {
  const { price, currency } = service;
  if (prepay.mode === "off" || currency !== "RUB" || price == null || price <= 0) return 0;
  if (prepay.mode === "fixed") return Math.min(prepay.amount, Math.ceil(price));
  return Math.ceil((price * prepay.percent) / 100);
}
