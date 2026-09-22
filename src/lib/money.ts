// «Деньги» хозяина — чистая часть: подписи периода, доли для полос и запасная
// сводка дня по записям. Сайт отдаёт цифры (lib/api/money.ts), экран рисует;
// всё, что можно проверить без сети, лежит здесь и покрыто money.test.ts.
import type { MoneyLine, MoneyPeriod, MoneySummary } from "@/lib/api/money";
import { addDays, count, dayTitle, rangeLabel, rub } from "@/lib/format";
import type { DayStats } from "@/lib/stats";
import { isLive } from "@/lib/stats";
import { localDay, localHHMM } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";

/** Именительный падеж — для подписи месяца («сентябрь»), dayTitle даёт родительный. */
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/**
 * День по часам сервиса из границы периода. Сайт может прислать и голую дату,
 * и ISO с временем; дату берём как есть, а момент времени переводим в день
 * сервиса — UTC-полночь понедельника это ещё воскресенье по Москве.
 */
function boundaryDay(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : localDay(new Date(v));
}

/**
 * Правая граница как последний день периода. Полночь в `to` — это исключающая
 * граница («до 21-го 00:00»), а подпись хочет включающий день — 20-е. Дата
 * без времени и любое другое время считаются уже последним днём.
 */
function lastDay(to: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) return to;
  const d = new Date(to);
  const day = localDay(d);
  return localHHMM(d) === "00:00" ? addDays(day, -1) : day;
}

/** «15 сентября» · «14 – 20 сентября» · «сентябрь» — подпись выручки по периоду. */
export function periodLabel(period: MoneyPeriod, from: string, to: string): string {
  const a = boundaryDay(from);
  if (period === "day") return dayTitle(a);
  if (period === "month") return MONTHS_NOM[Number(a.slice(5, 7)) - 1];
  return rangeLabel(a, lastDay(to));
}

/**
 * «+8%», «−3%», «0%»; null — сравнивать не с чем (первый период сервиса),
 * и тогда подписи нет вовсе: «+0%» выглядело бы как застой, а не как новизна.
 */
export function deltaLabel(deltaPct: number | null): string | null {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return null;
  const n = Math.round(deltaPct);
  if (n === 0) return "0%";
  return n > 0 ? `+${n}%` : `−${Math.abs(n)}%`;
}

/**
 * Доли для полос: каждое значение к максимуму, 0…1. Полоса лидера — целая,
 * остальных — пропорционально ему, как в макете; когда денег нет ни у кого,
 * все нули, а не деление на ноль.
 */
export function shares(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map(v => (max > 0 && v > 0 ? Math.min(1, v / max) : 0));
}

export type Conversion = {
  /** «2 из 3». */
  ratio: string;
  /** 0…1 для полосы. */
  k: number;
  /** «67% одобрено»; когда отчётов не было — так и говорим. */
  text: string;
  /** «+6 700 ₽» — что осмотры принесли сверх смены. */
  money: string;
};

/** Конверсия отчётов в работы — цифры для карточки «Отчёты в работу». */
export function conversion(sent: number, booked: number, bookedRevenue: number): Conversion {
  const safeSent = Math.max(0, sent);
  const safeBooked = Math.min(Math.max(0, booked), safeSent);
  const pct = safeSent > 0 ? Math.round((safeBooked / safeSent) * 100) : 0;
  return {
    ratio: `${safeBooked} из ${safeSent}`,
    k: safeSent > 0 ? safeBooked / safeSent : 0,
    text: safeSent > 0 ? `${pct}% одобрено` : "отчётов ещё не отправляли",
    money: `+${rub(Math.max(0, bookedRevenue))}`,
  };
}

/** «14 работ» — под деньгами мастера и услуги. */
export function jobsLabel(n: number): string {
  return count(n, "работа", "работы", "работ");
}

/**
 * Выручка по услугам из записей дня — то, что можно посчитать без сайта.
 * Считаем живые и выполненные записи, как dayStats: отменённая и неявка
 * денег не приносят. Крупное сверху; без цены — ноль, а не пропуск строки:
 * работа была, просто «договорная».
 */
export function byServiceFromRows(rows: readonly StoBookingRow[]): MoneyLine[] {
  const map = new Map<string, MoneyLine>();
  const add = (title: string, price: number | null) => {
    const line = map.get(title) ?? { title, count: 0, revenue: 0 };
    line.count += 1;
    line.revenue += price ?? 0;
    map.set(title, line);
  };
  for (const b of rows) {
    if (!isLive(b)) continue;
    add(b.service.title, b.service.price);
    // Добавленное по ходу работы — своими строками: это тоже работы дня.
    for (const e of b.data.extras ?? []) add(e.title, e.price);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

/**
 * Сводка дня, когда сайт не ответил: только то, что видно по записям дня.
 * Сравнения с прошлым, отчётов и мастеров здесь нет — нули и null честнее
 * выдуманных цифр, а экран по ним показывает «придёт с сайта».
 */
export function localDaySummary(input: { day: string; stats: DayStats; rows: readonly StoBookingRow[] }): MoneySummary {
  const { day, stats, rows } = input;
  return {
    period: "day",
    from: day,
    to: day,
    revenue: stats.revenue,
    deltaPct: null,
    average: stats.average,
    jobs: stats.count,
    loadPct: stats.loadPct,
    reportsSent: 0,
    reportsBooked: 0,
    bookedRevenue: 0,
    byMaster: [],
    byService: byServiceFromRows(rows),
  };
}
