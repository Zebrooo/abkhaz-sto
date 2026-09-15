import "server-only";
// Деньги сервиса — экран хозяина. Выручку по дню приложение считает само
// (lib/stats.ts, сумма по записям дня), но за неделю и месяц так уже нельзя:
// нужны прошлые периоды для сравнения, разбивка по мастерам и услугам и
// конверсия отчётов в работы, а это чтение за 30–60 дней на каждый заход.
// Считает сайт, приложение показывает.
//
// ЧЕСТНОСТЬ ЦИФР. Это выручка по записям, а не касса: факта оплаты в схеме
// нет, и «выполнено» означает «работа сделана», а не «деньги получены».
// Экран обязан называть это выручкой и не обещать больше.
import { siteGet, type ApiResult } from "@/lib/api/site-api";

export const MONEY_PERIODS = ["day", "week", "month"] as const;
export type MoneyPeriod = (typeof MONEY_PERIODS)[number];

export const MONEY_PERIOD_LABEL: Record<MoneyPeriod, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

export function isMoneyPeriod(v: unknown): v is MoneyPeriod {
  return typeof v === "string" && (MONEY_PERIODS as readonly string[]).includes(v);
}

export type MoneyLine = { title: string; count: number; revenue: number };

export type MoneySummary = {
  period: MoneyPeriod;
  /** Границы периода по часам сервиса — подпись «14–20 сентября» строит экран. */
  from: string;
  to: string;
  revenue: number;
  /** Насколько больше прошлого такого же периода, в процентах; null — сравнивать не с чем. */
  deltaPct: number | null;
  average: number;
  jobs: number;
  loadPct: number;
  /**
   * Конверсия отчётов в работы. «Одобрил» — значит записался: клиент видит в
   * отчёте, что надо исправить, и берёт следующий сеанс на эту работу.
   * Считаем по записям, пришедшим из отчётов, а не по нажатым галочкам —
   * галочка ничего не стоит, запись стоит.
   *
   * Главный показатель осмотров: ради него всё и затевалось.
   */
  reportsSent: number;
  reportsBooked: number;
  /** Деньги этих будущих работ — то, что осмотр принёс сверх текущей смены. */
  bookedRevenue: number;
  /** Выручка по мастерам и по услугам, крупное сверху. */
  byMaster: (MoneyLine & { masterId: number })[];
  byService: MoneyLine[];
};

/**
 * GET /api/sto/money?shopId&actorUserId&period → MoneySummary
 *
 * Период — слово, а не пара дат: «неделя» на сайте и в приложении обязаны
 * начинаться с одного и того же понедельника по часам сервиса, и решать это
 * должна одна сторона.
 */
export function fetchMoney(input: {
  shopId: number; actorUserId: string; period: MoneyPeriod;
}): Promise<ApiResult<MoneySummary>> {
  return siteGet<MoneySummary>("money", input);
}
