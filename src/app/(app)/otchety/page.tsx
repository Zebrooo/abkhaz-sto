import Link from "next/link";
import { fetchReports, REPORT_STATUS_LABEL, type ReportBrief } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { addDays, count, dayLabel, rangeLabel, shortName, todayLocal } from "@/lib/format";
import {
  countByStatus, groupByDay, isReportPeriod, periodRange, REPORT_BADGE, REPORT_PERIOD_LABEL,
  REPORT_PERIODS, type ReportPeriod,
} from "@/lib/reports";
import { localHHMM } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** «Сегодня», «Вчера», «14 сентября, понедельник» — заголовок дня в ленте. */
function groupTitle(day: string, today: string): string {
  if (day === today) return "Сегодня";
  if (day === addDays(today, -1)) return "Вчера";
  return dayLabel(day);
}

/**
 * «Готовые отчёты» — что сервис уже сделал: отчёты по диагностике за период,
 * свежие сверху, из строки — в сам отчёт.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ЭКРАН. Пункт «Осмотр и отчёты» ведёт на осмотр машины,
 * которая стоит на посту прямо сейчас, а когда её нет — на записи дня. Ни
 * там, ни там готовых отчётов не видно, и хозяин их не находил. Отчёты за
 * смену были только внизу «Моего поста» — у мастера и только за сегодня.
 *
 * ДАННЫЕ — С САЙТА (GET /api/sto/reports/list). Своей таблицы отчётов у
 * приложения нет и не будет (AGENTS.md), сумму считает сайт. Пока маршрут не
 * выкачен, он отвечает 404 — экран объясняет это словами, а не пустотой:
 * «отчётов нет» и «сайт их ещё не отдаёт» для владельца сервиса совершенно
 * разные новости.
 */
export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSection("inspect");
  if (!ctx) return null;
  const { shop, role } = ctx;
  const sp = await searchParams;
  const period: ReportPeriod = isReportPeriod(pick(sp.p)) ? (pick(sp.p) as ReportPeriod) : "week";
  const today = todayLocal();
  const range = periodRange(period, today);

  // Мастер видит свои отчёты: чужие ему не нужны, а сайт всё равно проверит
  // роль сам. Учётка без поста (masterId нет) — весь сервис, как у админа.
  const mineId = role === "master" ? ctx.masterId : null;
  const mineOnly = mineId !== null;
  const [res, pending] = await Promise.all([
    fetchReports({
      shopId: shop.id, actorUserId: ctx.userId, from: range.from, to: range.to,
      masterId: mineId ?? undefined,
    }),
    countPending(shop.id),
  ]);
  const reports = listOr(res);
  const groups = groupByDay(reports);
  const counts = countByStatus(reports);
  const whose = mineOnly ? "ваши отчёты" : "весь сервис";
  const periodText = period === "day" ? "сегодня" : rangeLabel(range.fromDay, range.toDay);
  const sub = `${count(reports.length, "отчёт", "отчёта", "отчётов")} · ${periodText}`;

  const seg = (
    <div className="seg">
      {REPORT_PERIODS.map(p => (
        <Link key={p} href={`/otchety?p=${p}`} aria-current={p === period ? "page" : undefined}>{REPORT_PERIOD_LABEL[p]}</Link>
      ))}
    </div>
  );

  return (
    <>
      <ScreenHead title="Готовые отчёты" sub={sub} unread={pending} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Готовые отчёты</div>
            <div className="head-s">Отчёты по диагностике · {whose} · {periodText}</div>
          </div>
          <div className="head-tail">{seg}</div>
        </div>
        <div className="m-only">{seg}</div>

        {!res.ok ? (
          <Unavailable code={res.code} error={res.error} />
        ) : reports.length === 0 ? (
          <Empty period={period} />
        ) : (
          <>
            <div className="tiles">
              <div className="tile"><div className="tile-k">Всего</div><div className="tile-v">{reports.length}</div></div>
              <div className="tile"><div className="tile-k">У клиента</div><div className="tile-v">{counts.with_client}</div></div>
              <div className="tile"><div className="tile-k">Не отправлены</div><div className="tile-v">{counts.draft + counts.with_admin}</div></div>
            </div>

            {groups.map(g => (
              <div key={g.day}>
                <div className="sect">{groupTitle(g.day, today)}</div>
                <div className="card card-flat">
                  {g.items.map(r => <Row key={r.inspectionId} report={r} showMaster={!mineOnly} />)}
                </div>
              </div>
            ))}

            <p className="hint">
              Отчёт собирается из осмотра: дефекты с фото, «проверено и в норме» и смета. Клиент видит его после отправки
              администратором — до этого он лежит здесь.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/** Строка ленты: время осмотра, машина, номер отчёта и мастер, состояние. */
function Row({ report, showMaster }: { report: ReportBrief; showMaster: boolean }) {
  const sub = [report.no, showMaster ? report.masterName && shortName(report.masterName) : null]
    .filter(Boolean).join(" · ");
  return (
    <Link className="row" href={`/zapis/${report.bookingId}/otchet`}>
      <span className="mono row-at">{localHHMM(new Date(report.inspectedAt))}</span>
      <div className="row-main">
        <div className="row-t">{report.car}</div>
        <div className="row-s">{sub}</div>
      </div>
      <span className={REPORT_BADGE[report.status]}>{REPORT_STATUS_LABEL[report.status]}</span>
    </Link>
  );
}

/** За период отчётов нет — предлагаем окно шире, прежде чем разводить руками. */
function Empty({ period }: { period: ReportPeriod }) {
  return (
    <div className="card">
      <div className="empty">
        <span className="sq"><Icon name="list" size={26} /></span>
        <div className="empty-t">За этот период отчётов нет</div>
        <div className="empty-s">Отчёт появляется после осмотра: мастер отмечает дефекты с фото, и отчёт собирается сам.</div>
        {period !== "month" && (
          <Link className="aui-btn aui-btn--outline aui-btn--md" href="/otchety?p=month">Показать 30 дней</Link>
        )}
      </div>
    </div>
  );
}

/**
 * Сайт отчётов не отдал. 404 — обычное состояние, пока маршрут не выкачен
 * или выключен флагом; остальное — поломка, и её текст показываем как есть,
 * чтобы было что сказать в поддержку.
 */
function Unavailable({ code, error }: { code: string; error: string }) {
  const expected = code === "not_found" || code === "not_configured";
  return (
    <div className="card">
      <div className="empty">
        <span className="sq"><Icon name="list" size={26} /></span>
        <div className="empty-t">{expected ? "Сайт пока не отдаёт отчёты" : "Отчёты не загрузились"}</div>
        <div className="empty-s">
          {expected
            ? "Отчёты по диагностике живут на стороне abkhaz-auto.ru и появятся здесь, как только сайт их включит. Осмотры и записи это не затрагивает."
            : error}
        </div>
      </div>
    </div>
  );
}
