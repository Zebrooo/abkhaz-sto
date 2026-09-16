import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { toMinutes } from "@/lib/sto/schedule";
import { dayOfWeek, localHHMM, localTime } from "@/lib/sto/slots";
import { DEFAULT_GAP_RULES, dayWindow, freeGaps, isLive } from "@/lib/stats";
import { formatRub, minutesLabel } from "@/lib/format";
import { Icon } from "@/components/Icon";

/** В блоке сетки помещается только имя: фамилия и «с сайта» съедают ширину. */
function firstName(b: StoBookingRow): string {
  const name = b.data.client?.name?.trim();
  if (name) return name.split(/\s+/)[0];
  return b.client_id ? "с сайта" : "клиент";
}

/** Минуты дня по часам сервиса. */
function minutesOf(at: string): number {
  const [h, m] = localHHMM(new Date(at)).split(":");
  return Number(h) * 60 + Number(m);
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Позиция и высота в часах — пересчёт в пиксели делает CSS (--hour). */
const at = (min: number) => `calc(${(min / 60).toFixed(4)} * var(--hour))`;

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

  // Свободные окна — по тем же правилам, что и запись (slots.ts): шаг сетки
  // и буфер после записи; иначе сетка предлагает окно, а форма отвечает «занято».
  const rules = schedule ? { stepMin: schedule.stepMin, bufferMin: schedule.bufferMin } : DEFAULT_GAP_RULES;
  const cols = Array.from({ length: Math.max(1, posts) }, (_, i) => i + 1).map(no => {
    const live = rows.filter(b => isLive(b) && b.post_no === no);
    const busy = live.map(b => ({ from: minutesOf(b.starts_at), to: minutesOf(b.ends_at) }));
    return { no, live, free: freeGaps(intervals, busy, rules) };
  });
  // Перерыв между интервалами приёма (обед) — полосой через все посты, а не
  // дырой в сетке: пустое место без подписи читается как «окно, которое забыли».
  const spans = intervals.map(i => ({ from: toMinutes(i.from), to: toMinutes(i.to) })).sort((a, b) => a.from - b.from);
  const breaks = spans.slice(1).map((iv, i) => ({ fromMin: spans[i].to, toMin: iv.from })).filter(b => b.toMin > b.fromMin);

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
          {breaks.map(b => (
            <div key={b.fromMin} className="tl-break" style={{ top: at(b.fromMin - win.fromMin), height: at(b.toMin - b.fromMin) }}>
              <span>Перерыв · {hhmm(b.fromMin)}–{hhmm(b.toMin)}</span>
            </div>
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
                    {/* .b-in — потому что высоту блока меряет @container, а
                        контейнер не может задать раскладку самому себе. */}
                    <div className="b-in">
                      <div className="b-time">
                        <span className="b-at">{hhmm(from)}<span className="b-to">–{hhmm(to)}</span></span>
                        <span className="b-price">{formatRub(b.service.price)}</span>
                      </div>
                      <div className="b-title">{b.service.title}</div>
                      <div className="b-client">{firstName(b)}</div>
                    </div>
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
