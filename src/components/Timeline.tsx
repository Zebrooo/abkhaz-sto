import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { toMinutes } from "@/lib/sto/schedule";
import { dayOfWeek, localHHMM, localTime } from "@/lib/sto/slots";
import { dayWindow, isLive } from "@/lib/stats";
import { formatRub, minutesLabel } from "@/lib/format";
import { Icon } from "@/components/Icon";

/** Минуты дня по часам сервиса. */
function minutesOf(at: string): number {
  const [h, m] = localHHMM(new Date(at)).split(":");
  return Number(h) * 60 + Number(m);
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Позиция и высота в часах — пересчёт в пиксели делает CSS (--hour). */
const at = (min: number) => `calc(${(min / 60).toFixed(4)} * var(--hour))`;

/** Окно короче 45 минут на сетке не показываем: записать в него нечего. */
const MIN_FREE_MIN = 45;

type Free = { fromMin: number; toMin: number };

/** Свободные куски поста внутри часов приёма (обед в свободное не попадает). */
function freeGaps(intervals: { from: string; to: string }[], busy: { from: number; to: number }[]): Free[] {
  const out: Free[] = [];
  for (const iv of intervals) {
    let cursor = toMinutes(iv.from);
    const end = toMinutes(iv.to);
    const inside = busy.filter(b => b.to > cursor && b.from < end).sort((a, b) => a.from - b.from);
    for (const b of inside) {
      if (b.from - cursor >= MIN_FREE_MIN) out.push({ fromMin: cursor, toMin: b.from });
      cursor = Math.max(cursor, b.to);
    }
    if (end - cursor >= MIN_FREE_MIN) out.push({ fromMin: cursor, toMin: end });
  }
  return out;
}

/**
 * Сетка часов на все посты: занятое — цветными блоками по статусу,
 * свободное — пунктиром с плюсом, «сейчас» — красной линией.
 */
export function Timeline({ rows, schedule, posts, day, now, newHref }: {
  rows: readonly StoBookingRow[];
  schedule: StoSchedule | null;
  posts: number;
  day: string;
  now: Date;
  /** Ссылка «записать» на свободное окно: (post, hhmm) → адрес. */
  newHref: (postNo: number, hhmm: string) => string;
}) {
  const win = dayWindow(schedule, day);
  const intervals = schedule && !schedule.daysOff.includes(day) ? (schedule.days[dayOfWeek(day)] ?? []) : [];
  const first = Math.ceil(win.fromMin / 60);
  const last = Math.floor(win.toMin / 60);
  const hours = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * 60);
  const nowMin = localTime(day, "00:00") <= now && now < localTime(day, "24:00")
    ? Math.round((now.getTime() - localTime(day, "00:00").getTime()) / 60_000)
    : null;
  const showNow = nowMin != null && nowMin >= win.fromMin && nowMin <= win.toMin;

  const cols = Array.from({ length: Math.max(1, posts) }, (_, i) => i + 1).map(no => {
    const live = rows.filter(b => isLive(b) && b.post_no === no);
    const busy = live.map(b => ({ from: minutesOf(b.starts_at), to: minutesOf(b.ends_at) }));
    return { no, live, free: freeGaps(intervals, busy) };
  });

  return (
    <>
      <div className="tl-head">
        {cols.map(c => <div key={c.no}>Пост {c.no}</div>)}
      </div>
      <div className="tl">
        <div className="tl-hours" style={{ height: at(win.toMin - win.fromMin) }}>
          {hours.map(h => (
            <div key={h} className="tl-hour" style={{ top: `calc(${at(h - win.fromMin)} - 7px)` }}>{hhmm(h)}</div>
          ))}
        </div>
        <div className="tl-grid" style={{ height: at(win.toMin - win.fromMin) }}>
          {hours.map(h => (
            <div key={h} className="tl-line" data-odd={(h / 60) % 2 === 1 ? "" : undefined} style={{ top: at(h - win.fromMin) }} />
          ))}
          {cols.map(c => (
            <div className="tl-col" key={c.no}>
              {c.free.map(g => (
                <Link
                  key={`${c.no}-${g.fromMin}`}
                  className="tl-free"
                  href={newHref(c.no, hhmm(g.fromMin))}
                  style={{ top: `calc(${at(g.fromMin - win.fromMin)} + 2px)`, height: `calc(${at(g.toMin - g.fromMin)} - 6px)` }}
                  aria-label={`Записать на ${hhmm(g.fromMin)}, пост ${c.no}`}
                >
                  <Icon name="plus" size={14} />
                  <span className="tl-free-lab">{hhmm(g.fromMin)} · {minutesLabel(g.toMin - g.fromMin)} свободно</span>
                </Link>
              ))}
              {c.live.map(b => {
                const from = minutesOf(b.starts_at), to = minutesOf(b.ends_at);
                return (
                  <Link
                    key={b.id}
                    className={`tl-block st-${b.status}`}
                    href={`/zapis/${b.id}?d=${day}`}
                    style={{ top: at(from - win.fromMin), height: `max(34px, calc(${at(to - from)} - 4px))` }}
                  >
                    <div className="b-time">
                      {hhmm(from)}<span className="b-to">–{hhmm(to)}</span>
                      <span className="b-price">{formatRub(b.service.price)}</span>
                    </div>
                    <div className="b-title">{b.service.title}</div>
                    <div className="b-client">{b.data.client?.name ?? (b.client_id ? "Клиент с сайта" : "Клиент")}</div>
                  </Link>
                );
              })}
            </div>
          ))}
          {showNow && (
            <div className="tl-now" style={{ top: at(nowMin! - win.fromMin) }}>
              <i /><b /><span className="at">{hhmm(nowMin!)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
