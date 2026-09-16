// Список готовых отчётов за период — чистые правила экрана «Отчёты».
// Базы и сети здесь нет: отчёты отдаёт сайт (lib/api/reports.ts), а здесь
// решается, какой период спросить, как разложить ответ по дням и какими
// цифрами подписать шапку.
//
// ПЕРИОД — СКОЛЬЗЯЩЕЕ ОКНО, А НЕ КАЛЕНДАРНЫЙ МЕСЯЦ. Хозяин открывает экран,
// чтобы увидеть, что уже сделано; календарный месяц первого числа показал бы
// один день и выглядел бы поломкой. Окно кончается сегодняшним днём и всегда
// короче потолка сайта (62 дня, MAX_STO_PERIOD_DAYS в parse.ts): период
// длиннее он отвергнет как validation_error.
//
// ДЕНЕГ ЗДЕСЬ НЕ СКЛАДЫВАЕМ. Сумму отчёта считает сайт (lib/api/reports.ts),
// и второе сложение тех же цен в приложении рано или поздно разойдётся с
// первым. Сводные цифры экрана — только про состояние отчётов: сколько
// собрано, сколько уже у клиента.
import type { ReportBrief, ReportStatus } from "@/lib/api/reports";
import { addDays } from "@/lib/format";
import { localDay, localTime } from "@/lib/sto/slots";

export const REPORT_PERIODS = ["day", "week", "month"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = {
  day: "Сегодня",
  week: "7 дней",
  month: "30 дней",
};

/** Сколько дней в окне, считая сегодняшний. */
export const REPORT_PERIOD_DAYS: Record<ReportPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export function isReportPeriod(v: unknown): v is ReportPeriod {
  return typeof v === "string" && (REPORT_PERIODS as readonly string[]).includes(v);
}

/**
 * Границы периода: дни — для подписи, моменты — для запроса к сайту.
 * Интервал полуоткрытый [from, to): to — полночь дня, следующего за
 * последним, иначе сегодняшние отчёты в список не попадут.
 */
export function periodRange(period: ReportPeriod, today: string): {
  fromDay: string; toDay: string; from: string; to: string;
} {
  const fromDay = addDays(today, -(REPORT_PERIOD_DAYS[period] - 1));
  return {
    fromDay,
    toDay: today,
    from: localTime(fromDay, "00:00").toISOString(),
    to: localTime(addDays(today, 1), "00:00").toISOString(),
  };
}

/**
 * Отчёты по дням осмотра, свежие сверху и внутри дня тоже. Сайт отдаёт их
 * уже в этом порядке, но экран на чужую сортировку не опирается: строки
 * вперемешку разъехались бы по заголовкам дней молча.
 */
export function groupByDay(reports: readonly ReportBrief[]): { day: string; items: ReportBrief[] }[] {
  const days = new Map<string, ReportBrief[]>();
  for (const r of [...reports].sort((a, b) => (a.inspectedAt < b.inspectedAt ? 1 : a.inspectedAt > b.inspectedAt ? -1 : 0))) {
    const day = localDay(new Date(r.inspectedAt));
    const bucket = days.get(day);
    if (bucket) bucket.push(r);
    else days.set(day, [r]);
  }
  return [...days].map(([day, items]) => ({ day, items }));
}

/** Сколько отчётов в каждом состоянии — плитки над списком. */
export function countByStatus(reports: readonly ReportBrief[]): Record<ReportStatus, number> {
  const counts: Record<ReportStatus, number> = { draft: 0, with_admin: 0, with_client: 0 };
  for (const r of reports) counts[r.status] += 1;
  return counts;
}

/** Бейдж состояния отчёта: у клиента — зелёный, черновик — жёлтый, у админа — серый. */
export const REPORT_BADGE: Record<ReportStatus, string> = {
  draft: "aui-badge is-tag-urgent",
  with_admin: "aui-badge",
  with_client: "aui-badge is-tag-free",
};
