import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { fetchReports, REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { clientName, vehicleLine } from "@/components/BookingRow";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { addDays, count, initials, minutesLabel, shortName, timeRange, todayLocal } from "@/lib/format";
import { masterDay } from "@/lib/master-day";
import { busyMinutes, jobNow, jobsAfter, minutesLeft } from "@/lib/mywork";
import { dayWindow } from "@/lib/stats";
import { localHHMM, localTime } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";
import { transitionAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Бейдж статуса отчёта: у клиента — зелёный, черновик — жёлтый, у админа — красный. */
const REPORT_BADGE: Record<ReportStatus, string> = {
  draft: "aui-badge is-tag-urgent",
  with_admin: "aui-badge",
  with_client: "aui-badge is-tag-free",
};

/** «Рустам А. · Nissan X-Trail 2016 · АГ 550 01» — кто и на чём. */
function carLine(b: StoBookingRow): string {
  return [shortName(clientName(b)), vehicleLine(b), b.data.vehicle?.plate].filter(Boolean).join(" · ");
}

const durationMin = (b: StoBookingRow) =>
  Math.max(0, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000));

/**
 * «Мой пост» — смена глазами мастера: кто он и где стоит, что в работе прямо
 * сейчас (с «осталось N мин»), что дальше на его посту и отчёты за смену.
 * Ни выручки, ни настроек. Записи — по привязкам с сайта, а без них — по
 * посту (lib/mywork.ts). Учётка без мастера видит не пустой экран, а
 * объяснение: привязать её может хозяин в «Доступах».
 */
export default async function MyWorkPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("bookings"))!;
  const { shop } = ctx;
  const pending = await countPending(shop.id);

  if (ctx.masterId === null) {
    return (
      <>
        <ScreenHead title="Мой пост" sub="учётка не привязана к посту" unread={pending} />
        <div className="page page-narrow stack">
          <div className="head">
            <div>
              <div className="head-t">Мой пост</div>
              <div className="head-s">Здесь мастер видит свою смену: текущую работу, следующие записи и отчёты.</div>
            </div>
          </div>
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="user" size={26} /></span>
              <div className="empty-t">Вы не привязаны к посту</div>
              <div className="empty-s">Попросите хозяина открыть «Доступы» и привязать вашу учётку к мастеру — тогда здесь появятся записи вашего поста.</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const day = todayLocal();
  const now = new Date();
  const { me, mine } = await masterDay(ctx, day);
  const reports = listOr(await fetchReports({
    shopId: shop.id, actorUserId: ctx.userId, masterId: ctx.masterId,
    from: localTime(day, "00:00").toISOString(), to: localTime(addDays(day, 1), "00:00").toISOString(),
  }));
  const current = jobNow(mine, now);
  const next = jobsAfter(mine, now);
  const win = dayWindow(shop.schedule, day);
  const shiftLine = win.off ? "сегодня выходной" : `смена до ${hhmm(win.toMin)}`;

  const name = me?.name ?? "Мастер";
  const postLabel = me?.postNo ? `пост ${me.postNo}` : "без поста";
  // В шапке телефона — только имя: «Пост 2 · Леван», фамилия не влезает.
  const title = me ? `${me.postNo ? `Пост ${me.postNo} · ` : ""}${me.name.trim().split(/\s+/)[0]}` : "Мой пост";
  const self = "/moi-raboty";

  return (
    <>
      <ScreenHead title={title} sub={shiftLine} unread={pending} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Мой пост</div>
            <div className="head-s">{name} · {postLabel} · {shiftLine}</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <div className="mw-hero">
          <div className="person">
            <span className="ava">{initials(name)}</span>
            <div className="row-main">
              <div className="person-n">{name}</div>
              <div className="person-s">{[postLabel, me?.speciality?.toLowerCase()].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="mw-shift">{me && !me.onShift ? "выходной" : "на смене"}</span>
          </div>
          <div className="tiles">
            <div className="tile"><div className="tile-k">Сегодня</div><div className="tile-v">{count(mine.length, "запись", "записи", "записей")}</div></div>
            <div className="tile"><div className="tile-k">Занято</div><div className="tile-v">{minutesLabel(busyMinutes(mine))}</div></div>
            <div className="tile"><div className="tile-k">Отчётов</div><div className="tile-v">{reports.length}</div></div>
          </div>
        </div>

        <div className="sect mw-sect">Сейчас в работе</div>
        {current ? (
          <div className="card card-accent mw-now">
            <div className="mw-now-head">
              <span className="mono mw-time">{timeRange(current.starts_at, current.ends_at)}</span>
              <span className="rspec is-accent">пост {current.post_no}</span>
              <span className="mono mw-left">осталось {minutesLeft(current.ends_at, now)} мин</span>
            </div>
            <div className="mw-now-t">{current.service.title}</div>
            <div className="mw-now-s">{carLine(current)}</div>
            <div className="mw-now-actions">
              <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/zapis/${current.id}/osmotr`}>
                <Icon name="camera" size={17} />Осмотр
              </Link>
              {current.status === "confirmed" && (
                <form action={transitionAction}>
                  <input type="hidden" name="shopId" value={shop.id} />
                  <input type="hidden" name="bookingId" value={current.id} />
                  <input type="hidden" name="transition" value="done" />
                  <input type="hidden" name="return" value={self} />
                  <button className="aui-btn aui-btn--outline aui-btn--md" type="submit">Готово</button>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="note-t">Пост свободен</div>
            <div className="note-s">
              {next.length > 0
                ? `Следующая запись в ${localHHMM(new Date(next[0].starts_at))} — ${next[0].service.title.toLowerCase()}.`
                : mine.length > 0 ? "На сегодня работы закончились." : "На сегодня записей нет."}
            </div>
          </div>
        )}

        <div className="sect mw-sect">Дальше на моём посту</div>
        <div className="card card-flat">
          {next.map(b => (
            <Link key={b.id} className="row" href={`/zapis/${b.id}?d=${day}`}>
              <span className="mono row-at">{localHHMM(new Date(b.starts_at))}</span>
              <div className="row-main">
                <div className="row-t">{b.service.title}</div>
                <div className="row-s">{[vehicleLine(b), shortName(clientName(b))].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="rspec">{minutesLabel(durationMin(b))}</span>
            </Link>
          ))}
          {next.length === 0 && <div className="row"><div className="row-s">Дальше записей нет</div></div>}
        </div>

        <div className="card card-sm mw-reports">
          <div className="card-t">Отчёты за смену</div>
          <div className="mw-report-list">
            {reports.map(r => (
              <Link key={r.inspectionId} className="mw-report" href={`/zapis/${r.bookingId}/otchet`}>
                <span className="mono mw-report-no">{r.no}</span>
                <span className="mw-report-car">{r.car}</span>
                <span className={REPORT_BADGE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</span>
              </Link>
            ))}
            {reports.length === 0 && <div className="card-s">Отчётов за смену пока нет — они появятся после осмотра.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
