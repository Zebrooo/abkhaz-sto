import Link from "next/link";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { fetchMoney, isMoneyPeriod, MONEY_PERIOD_LABEL, MONEY_PERIODS, type MoneyPeriod, type MoneySummary } from "@/lib/api/money";
import { fetchMasters } from "@/lib/api/masters";
import { listOr } from "@/lib/api/site-api";
import { countPending, dayBookings } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { count, initials, rub, todayLocal } from "@/lib/format";
import { conversion, deltaLabel, jobsLabel, localDaySummary, periodLabel, shares } from "@/lib/money";
import { dayStats } from "@/lib/stats";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Объяснение цифр — одно на оба вида: это выручка по записям, не касса. */
const HONEST = "Это выручка по записям, а не касса: «выполнено» значит «работа сделана», факта оплаты в записи нет.";

/**
 * «Деньги» — первый экран хозяина: выручка за день, неделю или месяц, средний
 * чек, загрузка, конверсия отчётов в работы, разбивка по мастерам и услугам.
 * Считает сайт (lib/api/money.ts); период — в адресе. Только день можно
 * посчитать здесь по записям, если сайт молчит; для недели и месяца нужны
 * прошлые периоды, и без сайта экран честно говорит, что сводки нет.
 */
export default async function MoneyPage({ searchParams }: { searchParams: SP }) {
  const ctx = (await requireSection("money"))!;
  const sp = await searchParams;
  const period: MoneyPeriod = isMoneyPeriod(pick(sp.p)) ? pick(sp.p) as MoneyPeriod : "day";
  const { shop } = ctx;

  const [res, mastersRes, pending] = await Promise.all([
    fetchMoney({ shopId: shop.id, actorUserId: ctx.userId, period }),
    fetchMasters(shop.id, ctx.userId),
    countPending(shop.id),
  ]);
  const masters = listOr(mastersRes);

  let summary: MoneySummary | null = res.ok ? res.data : null;
  // Запасной путь только для дня: сумма по записям дня — та же, что на
  // «Смене». Сравнений и отчётов в нём нет, и экран это говорит.
  let local = false;
  if (!summary && period === "day") {
    const day = todayLocal();
    const rows = await dayBookings(shop.id, day);
    const posts = shop.schedule?.posts ?? Math.max(1, ...rows.map(r => r.post_no));
    summary = localDaySummary({ day, stats: dayStats({ rows, schedule: shop.schedule, day, posts }), rows });
    local = true;
  }

  const posts = shop.schedule?.posts ?? 1;
  const subParts = [count(posts, "пост", "поста", "постов")];
  if (masters.length > 0) subParts.push(count(masters.length, "мастер", "мастера", "мастеров"));
  const sub = subParts.join(" · ");

  const seg = (
    <div className="seg dash-seg">
      {MONEY_PERIODS.map(p => (
        <Link key={p} href={`/svodka?p=${p}`} aria-current={p === period ? "page" : undefined}>{MONEY_PERIOD_LABEL[p]}</Link>
      ))}
    </div>
  );

  return (
    <>
      <ScreenHead title={shop.name} sub={sub} unread={pending} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Деньги сервиса</div>
            <div className="head-s">{shop.name} · {sub}</div>
          </div>
          <div className="head-tail">{seg}</div>
        </div>
        <div className="dash-seg-touch">{seg}</div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        {summary ? <Summary s={summary} local={local} masterNames={new Map(masters.map(m => [m.id, m.name]))} /> : (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="chart" size={26} /></span>
              <div className="empty-t">Сайт пока не отдаёт сводку</div>
              <div className="empty-s">
                Выручку за {period === "week" ? "неделю" : "месяц"} считает сайт: нужны прошлые периоды для сравнения и отчёты.
                {!res.ok && res.code !== "not_found" ? ` ${res.error}.` : ""}
              </div>
              <Link className="aui-btn aui-btn--outline aui-btn--md" href="/svodka?p=day">Показать день</Link>
            </div>
          </div>
        )}

        <p className="hint">{HONEST}</p>
      </div>
    </>
  );
}

function Summary({ s, local, masterNames }: { s: MoneySummary; local: boolean; masterNames: Map<number, string> }) {
  const delta = deltaLabel(s.deltaPct);
  const conv = conversion(s.reportsSent, s.reportsBooked, s.bookedRevenue);
  const masterK = shares(s.byMaster.map(m => m.revenue));
  return (
    <>
      <div className="dash-top">
        <div className="dark-card">
          <div className="eyebrow dk-eyebrow">Выручка · {periodLabel(s.period, s.from, s.to)}</div>
          <div className="dk-row">
            <div className="dk-big">{rub(s.revenue)}</div>
            {delta && <div className={delta.startsWith("−") ? "dk-delta is-down" : "dk-delta"}>{delta}</div>}
          </div>
          <div className="tiles dk-tiles">
            <div className="tile"><div className="tile-k">Средний чек</div><div className="tile-v">{rub(s.average)}</div></div>
            <div className="tile"><div className="tile-k">Загрузка постов</div><div className="tile-v">{s.loadPct}%</div></div>
            <div className="tile tile-web"><div className="tile-k">Записей</div><div className="tile-v">{s.jobs}</div></div>
          </div>
        </div>

        <div className="card conv">
          <div className="conv-head">
            <div className="conv-t">Отчёты в работу</div>
            <span className="conv-n">{conv.ratio}</span>
          </div>
          <div className="conv-s">Сколько диагностик клиенты одобрили — главный показатель осмотров.</div>
          {local ? (
            <div className="conv-s">Конверсию отчётов считает сайт — появится, когда он ответит.</div>
          ) : (
            <>
              <div className="bar conv-bar"><i style={{ "--k": conv.k } as React.CSSProperties} /></div>
              <div className="bar-legend"><span>{conv.text}</span><span>{conv.money}</span></div>
            </>
          )}
        </div>
      </div>

      {local && (
        <p className="hint">Сайт не ответил — выручка за день посчитана по записям дня, как на «Смене».</p>
      )}

      <div className="dash-cols">
        <div className="dash-block">
          <div className="sect">Мастера</div>
          <div className="card dash-list">
            {s.byMaster.length === 0 ? (
              <div className="dash-none">{local ? "Разбивку по мастерам считает сайт." : "За этот период работ у мастеров не было."}</div>
            ) : s.byMaster.map((m, i) => {
              const name = m.title || masterNames.get(m.masterId) || `Мастер ${m.masterId}`;
              return (
                <div key={m.masterId} className={i === 0 ? "mline is-top" : "mline"}>
                  <span className="ava ava-accent">{initials(name)}</span>
                  <div className="row-main">
                    <div className="mline-n">{name}</div>
                    <div className="mbar"><i style={{ "--k": masterK[i] } as React.CSSProperties} /></div>
                  </div>
                  <div className="mline-tail">
                    <div className="mline-m">{rub(m.revenue)}</div>
                    <div className="mline-j">{jobsLabel(m.count)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-block">
          <div className="sect">Услуги по деньгам</div>
          <div className="card dash-list">
            {s.byService.length === 0 ? (
              <div className="dash-none">За этот период работ не было.</div>
            ) : s.byService.map(l => (
              <div key={l.title} className="sline">
                <div className="row-main">
                  <div className="sline-t">{l.title}</div>
                  <div className="sline-c">{jobsLabel(l.count)}</div>
                </div>
                <div className="sline-m">{rub(l.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
