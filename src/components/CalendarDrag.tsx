"use client";
// Перенос записи на другой день недели — перетаскиванием прямо в календаре.
//
// Экран недели остаётся серверным: карточки записей и столбики дней рисует
// страница, а здесь только рука — ведём запись за ручкой на карточке,
// спрашиваем правила (lib/drag.ts), куда её можно положить, и отправляем
// тот же rescheduleAction, что и список окон. Ручка живёт внутри серверной
// карточки (BookingRow), поэтому связь между ней и этой оболочкой —
// контекст: без провайдера ручки просто нет, и на других экранах карточка
// не меняется.
//
// Подсветку столбиков ставим классом прямо в DOM: столбики нарисовал
// сервер, перерисовать их отсюда нельзя, а заводить ради подсветки вторую,
// клиентскую копию недели — значит держать две правды об одном экране.
// Своей обёртки у провайдера нет намеренно: лишний div между .page и её
// блоками сломал бы раскладку экрана (.stack, .rail).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { StoInterval } from "@/lib/sto/schedule";
import { dayDropAt, hhmmOf, type DayDropResult, type DragBlock } from "@/lib/drag";
import { rescheduleAction } from "@/app/(app)/actions";
import { Icon } from "@/components/Icon";

/** День недели для проверки броска: часы приёма, подпись и занятые записи. */
export type DragDay = {
  day: string;
  label: string;
  intervals: StoInterval[];
  blocks: DragBlock[];
};

type Handlers = {
  start: (bookingId: number, e: ReactPointerEvent<HTMLElement>) => void;
  move: (e: ReactPointerEvent<HTMLElement>) => void;
  up: (e: ReactPointerEvent<HTMLElement>) => void;
  cancel: (e: ReactPointerEvent<HTMLElement>) => void;
};

const DragCtx = createContext<Handlers | null>(null);

/**
 * Ручка переноса на карточке записи. Вне календаря провайдера нет — и
 * ручки нет: тянуть карточку некуда, а лишний значок только мешает.
 */
export function BookingGrip({ bookingId }: { bookingId: number }) {
  const h = useContext(DragCtx);
  if (!h) return null;
  return (
    <span
      className="bk-grip"
      role="button"
      aria-label="Перетащить запись на другой день"
      onPointerDown={e => h.start(bookingId, e)}
      onPointerMove={h.move}
      onPointerUp={h.up}
      onPointerCancel={h.cancel}
    >
      <Icon name="list" size={14} />
    </span>
  );
}

type Drag = { id: number; pointerId: number; startX: number; startY: number; moved: boolean };

/** Что сказать про день под курсором. */
function warning(res: DayDropResult, label: string, blocks: readonly DragBlock[]): string {
  const clash = blocks.find(b => b.id === res.conflicts[0]);
  switch (res.reason) {
    case "off":
      return `${label} — выходной: сервис не работает`;
    case "closed":
      return `${label}: в ${hhmmOf(res.fromMin)} сервис не принимает`;
    case "busy":
      return `Занято: ${label}, ${hhmmOf(res.fromMin)} — все посты заняты${clash ? `, «${clash.title}» ${hhmmOf(clash.fromMin)}–${hhmmOf(clash.toMin)}` : ""}`;
    default:
      return `Перенести на ${label}, ${hhmmOf(res.fromMin)} — пост ${res.postNo}`;
  }
}

export function CalendarDrag({ shopId, day, posts, bufferMin, days, movable, returnTo, children }: {
  shopId: number;
  /** Выбранный день — записи из его списка и тянут. */
  day: string;
  posts: number;
  bufferMin: number;
  days: DragDay[];
  /** Записи, которые можно перенести: живые, из списка выбранного дня. */
  movable: DragBlock[];
  returnTo: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<DayDropResult | null>(null);
  const [move, setMove] = useState<{ bookingId: number; day: string; hhmm: string } | null>(null);

  useEffect(() => {
    if (move) formRef.current?.requestSubmit();
  }, [move]);

  /** Подсветка столбика под курсором: зелёный — встанет, красный — нет. */
  function paint(target: string | null, bad: boolean) {
    for (const el of document.querySelectorAll("[data-drop-day]")) {
      const on = target !== null && el.getAttribute("data-drop-day") === target;
      el.classList.toggle("drop-ok", on && !bad);
      el.classList.toggle("drop-bad", on && bad);
    }
  }

  function stop() {
    paint(null, false);
    cardRef.current?.classList.remove("dragging");
    cardRef.current = null;
    setDrag(null);
    setOver(null);
  }

  function start(bookingId: number, e: ReactPointerEvent<HTMLElement>) {
    if (move || !movable.some(b => b.id === bookingId)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cardRef.current = e.currentTarget.closest("article");
    setDrag({ id: bookingId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false });
  }

  function onMove(e: ReactPointerEvent<HTMLElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) <= 4 && Math.abs(e.clientY - drag.startY) <= 4) return;
    e.preventDefault();
    if (!drag.moved) {
      cardRef.current?.classList.add("dragging");
      setDrag({ ...drag, moved: true });
    }
    const block = movable.find(b => b.id === drag.id);
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop-day]");
    const target = el?.getAttribute("data-drop-day") ?? null;
    const dd = target ? days.find(d => d.day === target) : undefined;
    if (!block || !dd || dd.day === day) {
      paint(null, false);
      setOver(null);
      return;
    }
    const res = dayDropAt({
      day: dd.day, intervals: dd.intervals, posts, bufferMin,
      fromMin: block.fromMin, durationMin: Math.max(1, block.toMin - block.fromMin),
      blocks: dd.blocks, movingId: block.id,
    });
    paint(dd.day, res.reason !== null);
    setOver(res);
  }

  function onUp(e: ReactPointerEvent<HTMLElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const res = drag.moved ? over : null;
    const id = drag.id;
    stop();
    if (!res || res.reason) return;
    setMove({ bookingId: id, day: res.day, hhmm: hhmmOf(res.fromMin) });
  }

  function onCancel(e: ReactPointerEvent<HTMLElement>) {
    if (drag && e.pointerId === drag.pointerId) stop();
  }

  const overDay = over ? days.find(d => d.day === over.day) : undefined;

  return (
    <DragCtx.Provider value={{ start, move: onMove, up: onUp, cancel: onCancel }}>
      {children}
      {drag?.moved && (
        <div className={`tl-warn${!over || over.reason ? " bad" : ""}`} role="status" aria-live="polite">
          {over && overDay ? warning(over, overDay.label, overDay.blocks) : "Тяните запись на другой день недели"}
        </div>
      )}
      <form ref={formRef} action={rescheduleAction} style={{ display: "none" }}>
        <input type="hidden" name="shopId" value={shopId} />
        <input type="hidden" name="bookingId" value={move?.bookingId ?? ""} />
        <input type="hidden" name="day" value={move?.day ?? ""} />
        <input type="hidden" name="hhmm" value={move?.hhmm ?? ""} />
        <input type="hidden" name="return" value={returnTo} />
      </form>
    </DragCtx.Provider>
  );
}
