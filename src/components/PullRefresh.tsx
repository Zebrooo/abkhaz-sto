"use client";
// «Потяни вниз — обновится». Экраны серверные, и свежесть у них ровно одна:
// то, что сервер отдал на последнем переходе. Записи же приходят с сайта
// сами, и человек за стойкой ждёт их, не трогая экран, — а в оболочке нет
// ни адресной строки, ни кнопки перезагрузки. Отсюда жест: он есть в каждом
// приложении, и его пробуют первым.
//
// Обновляем router.refresh(), а не location.reload(): это и есть
// принудительный поход на сервер (RSC-ответ мимо кэшей), но без белого
// экрана на перезагрузку бандла, с сохранённой прокруткой и открытой
// шторкой. useTransition даёт то, чего у refresh() нет самого по себе, —
// признак «ещё идёт»: пока он поднят, кружок крутится.
//
// Жест берём только у самого верха (scrollY === 0) и только вертикальный:
// иначе он отнимал бы прокрутку у таймлайна и перетаскивание у ручек
// записи (у них своя логика на pointer-событиях, CalendarDrag).
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PULL_TRIGGER, pullMove } from "@/lib/pull";

/**
 * Где жест не наш совсем: шторка и затемнение (внутри шторки свой скролл),
 * колесо времени, ручки переноса записи. data-no-pull — на случай, когда
 * экрану понадобится отключить жест у своего блока.
 */
const SKIP = ".sheet, .scrim, .wheel, .bk-grip, .tl-grip, [data-no-pull]";

export function PullRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, startRefresh] = useTransition();
  // Начало жеста, решение «жест наш» и пройденный путь — в ref: они меняются
  // на каждом движении пальца, и слушателям нужно свежее значение, а не то,
  // что было при подписке. В состоянии живёт только то, что рисуется.
  const g = useRef<{ y: number; x: number; mine: boolean; dist: number } | null>(null);

  useEffect(() => {
    // touchmove подписан не всегда, а только пока палец может оказаться
    // нашим, и намеренно не passive: только так можно удержать страницу от
    // родной оттяжки. Постоянная неpassive-подписка на документ заставляла
    // бы браузер ждать наш обработчик на КАЖДОЙ прокрутке — на дешёвом
    // планшете за стойкой это видно рывками в таймлайне.
    const watch = () => document.addEventListener("touchmove", onMove, { passive: false });
    const unwatch = () => document.removeEventListener("touchmove", onMove);
    const drop = () => { g.current = null; setPull(0); unwatch(); };

    function onStart(e: TouchEvent) {
      g.current = null;
      unwatch();
      // Обновление уже идёт — второй жест ему ничем не поможет.
      if (busy || e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.touches[0];
      if (t.target instanceof Element && t.target.closest(SKIP)) return;
      g.current = { y: t.clientY, x: t.clientX, mine: false, dist: 0 };
      watch();
    }

    function onMove(e: TouchEvent) {
      const gest = g.current;
      if (!gest || e.touches.length !== 1) return;
      const t = e.touches[0];
      const move = pullMove(gest.mine, t.clientY - gest.y, t.clientX - gest.x);
      if (move.kind === "wait") return;
      if (move.kind === "drop") return drop();
      gest.mine = true;
      // Успели прокрутиться (инерция, якорь) — жест уже не про обновление.
      if (window.scrollY > 0) return drop();
      // Держим страницу на месте: без этого Chrome показал бы свою
      // «потяни-обнови», а iOS — резиновый отскок поверх нашего кружка.
      if (e.cancelable) e.preventDefault();
      gest.dist = move.dist;
      setPull(move.dist);
    }

    function onEnd() {
      const gest = g.current;
      drop();
      // Порог считаем по тому же числу, что видел человек: кружок дошёл до
      // отметки — обновляем.
      if (gest?.mine && gest.dist >= PULL_TRIGGER) startRefresh(() => router.refresh());
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      unwatch();
    };
  }, [busy, router, startRefresh]);

  const ready = pull >= PULL_TRIGGER;
  // Отпустили — кружок либо уехал наверх, либо остался на отметке и крутится,
  // пока сервер отвечает. Переход в CSS, поэтому анимации здесь нет.
  const shown = busy ? PULL_TRIGGER : pull;
  return (
    <div className="pull" role="status" aria-live="polite">
      <span
        className={`pull-i${ready || busy ? " ready" : ""}${pull > 0 ? " held" : ""}`}
        style={{ transform: `translate3d(0, ${shown}px, 0)`, opacity: shown > 0 ? 1 : 0 }}
      >
        {busy
          ? <i className="spin" />
          : <Icon name="chevDown" size={18} style={{ transform: `rotate(${ready ? 180 : 0}deg)` }} />}
      </span>
      {busy && <span className="sr">Обновляю экран</span>}
    </div>
  );
}
