import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { localHHMM, localTime } from "@/lib/sto/slots";
import { dayStats, dayWindow, isLive, postsNow } from "@/lib/stats";
import { BookingRow } from "@/components/BookingRow";
import { Icon } from "@/components/Icon";
import { count, dayEyebrow, rub } from "@/lib/format";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Сводка смены. Один блок на два места: экран «Смена» на телефоне и правая
 * колонка рабочего места. Что показать, а что спрятать, решает CSS через
 * `.rail` — цифры и разметка общие.
 */
export function ShiftSummary({ rows, schedule, day, posts }: {
  rows: readonly StoBookingRow[];
  schedule: StoSchedule | null;
  day: string;
  posts: number;
}) {
  const s = dayStats({ rows, schedule, day, posts });
  const win = dayWindow(schedule, day);
  return (
    <div className="card">
      <div className="eyebrow">
        <span className="e-day">{dayEyebrow(day)}</span>
        <span className="e-shift">Смена</span>
      </div>
      <div className="big-row">
        <div className="big">{count(s.count, "запись", "записи", "записей")}</div>
        <div className="big-sub">на {count(s.posts, "посту", "постах", "постах")}</div>
      </div>
      <div className="tiles">
        <div className="tile"><div className="tile-k">Выручка</div><div className="tile-v">{rub(s.revenue)}</div></div>
        <div className="tile"><div className="tile-k">Загрузка</div><div className="tile-v">{s.loadPct}%</div></div>
        <div className="tile tile-avg"><div className="tile-k">Средний чек</div><div className="tile-v">{rub(s.average)}</div></div>
      </div>
      <div className="bar"><i style={{ width: `${s.loadPct}%` }} /></div>
      <div className="bar-legend">
        <span>занято {s.busySlots} {s.totalSlots > 0 ? `окон из ${s.totalSlots}` : "окон"}</span>
        <span className="e-day">{win.off ? "выходной" : `до ${hhmm(win.toMin)}`}</span>
        <span className="e-shift">{count(s.count, "запись", "записи", "записей")} · {count(s.posts, "пост", "поста", "постов")}</span>
      </div>
    </div>
  );
}

/** Записи, которые ждут ответа сервиса — их видно и на «Смене», и справа. */
export function PendingBlock({ rows, day, returnTo }: { rows: readonly StoBookingRow[]; day: string; returnTo: string }) {
  const pending = rows.filter(b => b.status === "new");
  if (pending.length === 0) return null;
  return (
    <>
      <div className="sect rail-t">
        <span>Ждут подтверждения</span>
        <span className="aui-badge is-tag-urgent">{pending.length}</span>
      </div>
      {pending.map(b => <BookingRow key={b.id} b={b} variant="pending" returnTo={returnTo} day={day} />)}
    </>
  );
}

/** Что сейчас на постах: занятый пост открывает запись, свободный — новую. */
export function PostsNowBlock({ rows, schedule, day, posts, now }: {
  rows: readonly StoBookingRow[];
  schedule: StoSchedule | null;
  day: string;
  posts: number;
  now: Date;
}) {
  const win = dayWindow(schedule, day);
  const dayEnd = localTime(day, hhmm(win.toMin));
  const list = postsNow({ rows, posts, now, dayEnd, hhmm: at => localHHMM(at) });
  const intervals = schedule?.days ?? null;
  return (
    <>
      <div className="sect rail-t">Сейчас на постах</div>
      {list.map(p => {
        const busyMin = rows.filter(b => isLive(b) && b.post_no === p.no)
          .reduce((sum, b) => sum + Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000), 0);
        const pct = win.workMin > 0 ? Math.min(100, Math.round((busyMin / win.workMin) * 100)) : 0;
        const href = p.bookingId ? `/zapis/${p.bookingId}?d=${day}` : `/kalendar/novaya?d=${day}&post=${p.no}`;
        return (
          <Link key={p.no} className={`card card-sm post-row${p.busy ? " busy" : ""}`} href={href}>
            <span className={`sq${p.busy ? " sq-accent" : ""}`}><Icon name={p.busy ? "car" : "plus"} size={22} /></span>
            <i className="pn-dot" />
            <div className="row-main">
              <div className="t"><b>Пост {p.no}</b><span>· {p.busy ? "занят" : "свободен"}</span></div>
              <div className="s">{p.line}</div>
              <div className="bar bar-thin"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <span className="till">{p.till}</span>
          </Link>
        );
      })}
      {intervals === null && <p className="hint">Расписание не задано — окна не считаются.</p>}
    </>
  );
}
