"use client";
// Сетка часов — единственный экран, где запись двигают руками, поэтому он
// клиентский. Всё остальное на нём по-прежнему серверное: данные приходят
// готовыми, а перенос уходит той же серверной формой (rescheduleAction),
// что и кнопки «Перенести» — браузер здесь только ведёт блок за курсором и
// заранее говорит, что получится.
//
// Палец тащит запись за ручку в углу блока, мышь — за весь блок: на телефоне
// блок занимает полколонки, и если бы он ловил любое касание, экран нельзя
// было бы прокрутить. Клавиатурой перенос делается как раньше — кнопкой
// «Перенести» и списком окон (?move=ID).
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoSchedule } from "@/lib/sto/schedule";
import { toMinutes } from "@/lib/sto/schedule";
import { DEFAULT_LEAD_MIN, dayOfWeek, localTime } from "@/lib/sto/slots";
import { canReschedule } from "@/lib/sto/transitions";
import { DEFAULT_GAP_RULES, dayWindow, freeGaps, isLive } from "@/lib/stats";
import { busyBlocks, dropAt, dropWarning, hhmmOf, minutesOf, type DropResult } from "@/lib/drag";
import { formatRub, minutesLabel } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { rescheduleAction } from "@/app/(app)/actions";

/** В блоке сетки помещается только имя: фамилия и «с сайта» съедают ширину. */
function firstName(b: StoBookingRow): string {
  const name = b.data.client?.name?.trim();
  if (name) return name.split(/\s+/)[0];
  return b.client_id ? "с сайта" : "клиент";
}

const hhmm = hhmmOf;
/** Позиция и высота в часах — пересчёт в пиксели делает CSS (--hour). */
const at = (min: number) => `calc(${(min / 60).toFixed(4)} * var(--hour))`;

/** Запись под курсором: что тащим, откуда взяли и куда ведём. */
type Drag = {
  id: number;
  pointerId: number;
  durationMin: number;
  /** Минут от начала записи до точки захвата: блок не прыгает верхом под курсор. */
  grabMin: number;
  postNo: number;
  /** Минута дня под курсором — начало записи ДО притяжения к сетке. */
  minute: number;
  startX: number;
  startY: number;
  /** Курсор ушёл дальше порога: до этого — обычное нажатие, а не перенос. */
  moved: boolean;
};

/** Ближе этого края экрана сетка едет сама: день выше телефона. */
const EDGE_PX = 90;

/**
 * Сетка часов на все посты: занятое — цветными блоками по статусу,
 * свободное — пунктиром с плюсом, «сейчас» — красной линией. Живую запись
 * можно перетащить на другое время и пост: под курсором показывается, куда
 * она встанет, а наложение на чужую запись и время вне часов приёма
 * подсвечиваются красным и бросок не проходит.
 */
export function Timeline({ rows, schedule, posts, day, now, shopId, returnTo }: {
  rows: readonly StoBookingRow[];
  schedule: StoSchedule | null;
  posts: number;
  day: string;
  now: Date;
  /** Чей сервис — для серверного действия переноса. */
  shopId: number;
  /** Куда вернуться, если перенос не прошёл. */
  returnTo: string;
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
  const dayPassed = now >= localTime(day, "24:00");
  // Прошедшее время сетки — фоном: пустота там читается как «прошло», а не
  // как окно, которое забыли разметить.
  const pastTo = nowMin != null ? Math.min(nowMin, win.toMin) : dayPassed ? win.toMin : win.fromMin;

  // Свободные окна — по тем же правилам, что и запись (slots.ts): шаг сетки,
  // буфер между записями и не раньше «сейчас» плюс lead; иначе сетка
  // предлагает окно, а форма отвечает «занято» или не находит его в списке.
  const rules = schedule ? { stepMin: schedule.stepMin, bufferMin: schedule.bufferMin } : DEFAULT_GAP_RULES;
  const notBefore = nowMin != null ? nowMin + DEFAULT_LEAD_MIN : dayPassed ? Infinity : 0;
  // Пост убрали из расписания, а запись на нём осталась — колонку всё равно
  // рисуем, иначе запись пропадает с доски (на вебе списка дня нет).
  const lastPost = Math.max(1, posts, ...rows.filter(isLive).map(b => b.post_no));
  const cols = Array.from({ length: lastPost }, (_, i) => i + 1).map(no => {
    const live = rows.filter(b => isLive(b) && b.post_no === no);
    const busy = live.map(b => ({ from: minutesOf(b.starts_at), to: minutesOf(b.ends_at) }));
    return { no, live, free: freeGaps(intervals, busy, rules, notBefore) };
  });
  // Перерыв между интервалами приёма (обед) — полосой через все посты, а не
  // дырой в сетке: пустое место без подписи читается как «окно, которое забыли».
  const spans = intervals.map(i => ({ from: toMinutes(i.from), to: toMinutes(i.to) })).sort((a, b) => a.from - b.from);
  const breaks = spans.slice(1).map((iv, i) => ({ fromMin: spans[i].to, toMin: iv.from })).filter(b => b.toMin > b.fromMin);

  const gridRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<number, HTMLDivElement>());
  const formRef = useRef<HTMLFormElement>(null);
  /* Блок — ссылка на карточку записи: после перетаскивания мышью её клик
     гасим, иначе бросок заодно открывает запись. */
  const dragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [move, setMove] = useState<{ bookingId: number; hhmm: string; postNo: number } | null>(null);

  // Занятость поста — по тем же записям, что считает сервер (busyBlocks).
  const blocks = busyBlocks(rows);
  const res: DropResult | null = drag
    ? dropAt({
        intervals, stepMin: rules.stepMin, bufferMin: rules.bufferMin,
        durationMin: drag.durationMin, postNo: drag.postNo, minute: drag.minute,
        blocks, movingId: drag.id,
      })
    : null;
  const ghost = drag?.moved ? res : null;

  // Перенос уходит серверным действием, как из формы окон: состояние ставим
  // в броске, отправку делает форма — своего пути к базе у экрана нет.
  useEffect(() => {
    if (move) formRef.current?.requestSubmit();
  }, [move]);

  const minuteAt = (clientY: number) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r || r.height <= 0) return win.fromMin;
    return win.fromMin + ((clientY - r.top) / r.height) * (win.toMin - win.fromMin);
  };
  const postAt = (clientX: number) => {
    let best: { no: number; dist: number } | null = null;
    for (const [no, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      const dist = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (!best || dist < best.dist) best = { no, dist };
    }
    return best?.no ?? null;
  };

  function start(b: StoBookingRow, e: ReactPointerEvent<HTMLElement>, viaGrip: boolean) {
    if (move || !canReschedule(b.status)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Палец — только за ручку: иначе страницу не прокрутить мимо записей.
    if (!viaGrip && e.pointerType !== "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = minutesOf(b.starts_at);
    const durationMin = Math.max(1, minutesOf(b.ends_at) - from);
    setDrag({
      id: b.id, pointerId: e.pointerId, durationMin, postNo: b.post_no, minute: from,
      grabMin: Math.min(Math.max(0, minuteAt(e.clientY) - from), durationMin),
      startX: e.clientX, startY: e.clientY, moved: false,
    });
  }

  function onMove(e: ReactPointerEvent<HTMLElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4;
    if (!moved) return;
    e.preventDefault();
    // Сетка выше экрана телефона: у края она едет сама, иначе запись из
    // девяти утра не донести до шести вечера.
    if (e.clientY < EDGE_PX) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, 14);
    dragged.current = true;
    setDrag({ ...drag, moved: true, minute: minuteAt(e.clientY) - drag.grabMin, postNo: postAt(e.clientX) ?? drag.postNo });
  }

  function onUp(e: ReactPointerEvent<HTMLElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const done = drag.moved ? res : null;
    setDrag(null);
    if (!done || done.reason) return;
    // Бросили туда же, откуда взяли, — переносить нечего.
    const row = rows.find(r => r.id === drag.id);
    if (row && done.postNo === row.post_no && done.fromMin === minutesOf(row.starts_at)) return;
    setMove({ bookingId: drag.id, hhmm: hhmmOf(done.fromMin), postNo: done.postNo });
  }

  function onCancel(e: ReactPointerEvent<HTMLElement>) {
    if (drag && e.pointerId === drag.pointerId) setDrag(null);
  }

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
        <div className="tl-grid" ref={gridRef} style={{ height: at(win.toMin - win.fromMin) }} data-dragging={drag?.moved ? "" : undefined}>
          {hours.map(h => (
            <div key={h} className="tl-line" data-odd={(h / 60) % 2 === 1 ? "" : undefined} style={{ top: at(h - win.fromMin) }} />
          ))}
          {pastTo > win.fromMin && <div className="tl-past" style={{ top: 0, height: at(pastTo - win.fromMin) }} />}
          {breaks.map(b => (
            <div key={b.fromMin} className="tl-break" style={{ top: at(b.fromMin - win.fromMin), height: at(b.toMin - b.fromMin) }}>
              <span>Перерыв · {hhmm(b.fromMin)}–{hhmm(b.toMin)}</span>
            </div>
          ))}
          {cols.map(c => (
            <div
              className="tl-col"
              key={c.no}
              ref={el => {
                if (el) colRefs.current.set(c.no, el);
                else colRefs.current.delete(c.no);
              }}
            >
              {c.free.map(g => (
                <Link
                  key={`${c.no}-${g.fromMin}`}
                  className="tl-free"
                  href={`/kalendar/novaya?d=${day}&post=${c.no}&hhmm=${hhmm(g.fromMin)}`}
                  style={{ top: `calc(${at(g.fromMin - win.fromMin)} + 2px)`, height: `calc(${at(g.toMin - g.fromMin)} - 6px)` }}
                  aria-label={`Записать на ${hhmm(g.fromMin)}, пост ${c.no}`}
                >
                  <Icon name="plus" size={14} />
                  <span className="tl-free-lab">{hhmm(g.fromMin)} · {minutesLabel(g.toMin - g.fromMin)} свободно</span>
                </Link>
              ))}
              {c.live.map(b => {
                const from = minutesOf(b.starts_at), to = minutesOf(b.ends_at);
                // Запись за краями сетки (часы поменяли после записи) обрезаем
                // по окну дня, а не рисуем над шапкой постов или под карточкой.
                const top = Math.max(win.fromMin, from), bottom = Math.min(win.toMin, to);
                if (bottom <= top) return null;
                const moving = drag?.id === b.id;
                const clash = ghost?.conflicts.includes(b.id) ?? false;
                return (
                  <Link
                    key={b.id}
                    className={`tl-block st-${b.status}${moving && drag?.moved ? " dragging" : ""}${clash ? " clash" : ""}`}
                    href={`/zapis/${b.id}?d=${day}`}
                    /* Блок тянем сами: родное перетаскивание ссылки браузером
                       увело бы курсор с сетки на адресную строку. */
                    draggable={false}
                    /* Пол 18px — одна строка текста: 15-минутные записи подряд не должны наезжать друг на друга. */
                    style={{ top: at(top - win.fromMin), height: `max(18px, calc(${at(bottom - top)} - 4px))` }}
                    onPointerDown={e => start(b, e, false)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                    onClickCapture={e => {
                      // Мышь тащила блок — гасим клик, иначе бросок заодно
                      // открыл бы карточку записи.
                      if (!dragged.current) return;
                      dragged.current = false;
                      e.preventDefault();
                    }}
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
                    {canReschedule(b.status) && !move && (
                      <span
                        className="tl-grip"
                        role="button"
                        aria-label={`Перетащить запись «${b.service.title}»`}
                        onPointerDown={e => { e.stopPropagation(); start(b, e, true); }}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onCancel}
                        onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                      >
                        <Icon name="list" size={12} />
                      </span>
                    )}
                  </Link>
                );
              })}
              {ghost && ghost.postNo === c.no && drag && (
                <div
                  className={`tl-ghost${ghost.reason ? " bad" : ""}`}
                  style={{
                    top: at(Math.min(Math.max(ghost.fromMin, win.fromMin), Math.max(win.fromMin, win.toMin - 15)) - win.fromMin),
                    height: `max(18px, calc(${at(drag.durationMin)} - 4px))`,
                  }}
                >
                  <span>{ghost.reason === "closed" ? "нельзя" : `${hhmm(ghost.fromMin)}–${hhmm(ghost.toMin)}`}</span>
                </div>
              )}
            </div>
          ))}
          {showNow && (
            <div className="tl-now" style={{ top: at(nowMin! - win.fromMin) }}>
              <i /><b /><span className="at">{hhmm(nowMin!)}</span>
            </div>
          )}
        </div>
      </div>
      {ghost && (
        <div className={`tl-warn${ghost.reason ? " bad" : ""}`} role="status" aria-live="polite">
          {dropWarning(ghost, blocks, rules.bufferMin)}
        </div>
      )}
      <form ref={formRef} action={rescheduleAction} style={{ display: "none" } as CSSProperties}>
        <input type="hidden" name="shopId" value={shopId} />
        <input type="hidden" name="bookingId" value={move?.bookingId ?? ""} />
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="hhmm" value={move?.hhmm ?? ""} />
        <input type="hidden" name="postNo" value={move?.postNo ?? ""} />
        <input type="hidden" name="return" value={returnTo} />
      </form>
    </>
  );
}
