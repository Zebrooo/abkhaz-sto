import Link from "next/link";
import { Icon } from "@/components/Icon";
import { dayEyebrow, dayTitle, todayLocal } from "@/lib/format";
import { addMonths, monthGrid, monthOf, monthTitle } from "@/lib/month";

/**
 * Маленький календарь: ткнуть и сразу попасть в нужный день, хоть через
 * месяц. Стоит и в форме записи (чипы показывают только ближайшие дни, а
 * клиента записывают и на октябрь), и в календаре записей.
 *
 * СЕРВЕРНЫЙ И БЕЗ JS. Открыт или закрыт — решает адрес (?m=2026-10), а не
 * состояние в браузере: и кнопка «Календарь», и стрелки месяцев, и сами дни
 * — обычные ссылки. Отсюда два следствия, ради которых это и сделано так:
 * закрытый календарь не стоит экрану НИ ОДНОГО лишнего запроса (точки по
 * дням месяца читаются, только когда он открыт), и он не «залипает»
 * открытым при переходах, потому что выбор дня уводит на адрес без месяца.
 */
export function DayPick({
  day, month, openHref, closeHref, dayHref, monthHref, counts, isOff, label, inline,
}: {
  /** Выбранный день — он же подсвечен в сетке. */
  day: string;
  /** Показываемый месяц; пустая строка — календарь закрыт. */
  month: string;
  /** Адрес, который открывает календарь на месяце выбранного дня. */
  openHref: string;
  /** Адрес без месяца — закрыть. */
  closeHref: string;
  dayHref: (day: string) => string;
  monthHref: (month: string) => string;
  /** Сколько записей в дне — точка под числом. Для формы записи не нужно. */
  counts?: Record<string, number>;
  /** Выходной сервиса: клетка гаснет, но остаётся кликабельной. */
  isOff?: (day: string) => boolean;
  /** Подпись на кнопке; по умолчанию — выбранный день. */
  label?: string;
  /**
   * Календарь в потоке, а не всплывашкой. Нужен там, где всплывашку обрезает
   * рамка карточки (форма записи на вебе: .nb-box с overflow: hidden).
   */
  inline?: boolean;
}) {
  const open = month !== "";
  const shown = open ? month : monthOf(day);
  const today = todayLocal();
  return (
    <div className={`dp${open ? " is-open" : ""}${inline ? " dp-inline" : ""}`}>
      {/* Календарь, не часы: кнопка выбирает ДЕНЬ, а часы на ней путали её
          с выбором времени — окна времени стоят на тех же экранах рядом. */}
      <Link className="dp-btn" href={open ? closeHref : openHref} aria-expanded={open}>
        <Icon name="calendar" size={15} />
        <span>{label ?? dayTitle(day)}</span>
        <Icon name="chevron" size={14} />
      </Link>
      {open && (
        <div className="dp-box">
          <div className="dp-head">
            <Link className="dp-nav" href={monthHref(addMonths(shown, -1))} aria-label="Прошлый месяц">
              <Icon name="chevron" size={16} />
            </Link>
            <span className="dp-title">{monthTitle(shown)}</span>
            <Link className="dp-nav dp-next" href={monthHref(addMonths(shown, 1))} aria-label="Следующий месяц">
              <Icon name="chevron" size={16} />
            </Link>
          </div>
          <div className="dp-week">
            {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="dp-grid">
            {monthGrid(shown).map(cell => {
              const n = counts?.[cell.day] ?? 0;
              const off = isOff?.(cell.day) ?? false;
              const cls = [
                "dp-day",
                cell.inMonth ? "" : "dp-out",
                cell.day === day ? "is-on" : "",
                cell.day === today ? "is-today" : "",
                off ? "is-off" : "",
              ].filter(Boolean).join(" ");
              // Имя ссылки — вся дата словами и состояние дня: голое число
              // с экрана читалки ничего не значит.
              const title = [
                dayEyebrow(cell.day),
                n > 0 ? `${n} зап.` : null,
                off ? "выходной" : null,
              ].filter(Boolean).join(", ");
              return (
                <Link
                  key={cell.day}
                  className={cls}
                  href={dayHref(cell.day)}
                  aria-label={title}
                  aria-current={cell.day === day ? "date" : undefined}
                >
                  {Number(cell.day.slice(8, 10))}
                  {n > 0 && <span className="dp-dot" aria-hidden />}
                </Link>
              );
            })}
          </div>
          <div className="dp-foot">
            <Link className="dp-close" href={closeHref}>Закрыть</Link>
            <Link className="dp-today" href={dayHref(today)}>Сегодня</Link>
          </div>
        </div>
      )}
    </div>
  );
}
