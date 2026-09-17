import Link from "next/link";
import { Icon } from "@/components/Icon";
import { dayTitle, todayLocal } from "@/lib/format";
import { addMonths, monthGrid, monthOf, monthTitle } from "@/lib/month";

/**
 * Маленький календарь: ткнуть и сразу попасть в нужный день, хоть через
 * месяц. Стоит и в форме записи (чипы показывают только ближайшие дни, а
 * клиента записывают и на октябрь), и в календаре записей.
 *
 * СЕРВЕРНЫЙ И БЕЗ JS. Открытие — обычный <details>, выбор дня и переход по
 * месяцам — ссылки: месяц живёт в адресе (?m=2026-10). Поэтому календарик
 * работает так же, как остальной экран, переживает «назад» и не тянет в
 * браузер ни байта кода.
 *
 * Открыт, когда в адресе есть месяц: иначе переход «вперёд на октябрь»
 * закрывал бы календарь ровно в тот момент, когда человек им пользуется.
 */
export function DayPick({
  day, month, dayHref, monthHref, counts, isOff, label,
}: {
  /** Выбранный день — он же подсвечен в сетке. */
  day: string;
  /** Показываемый месяц (из адреса). */
  month: string;
  dayHref: (day: string) => string;
  monthHref: (month: string) => string;
  /** Сколько записей в дне — точка под числом. Для формы записи не нужно. */
  counts?: Record<string, number>;
  /** Выходной сервиса: клетка гаснет, но остаётся кликабельной. */
  isOff?: (day: string) => boolean;
  /** Подпись на кнопке; по умолчанию — выбранный день. */
  label?: string;
}) {
  const shown = month || monthOf(day);
  const today = todayLocal();
  const open = month !== "";
  return (
    <details className="dp" open={open}>
      <summary className="dp-btn">
        <Icon name="clock" size={15} />
        <span>{label ?? dayTitle(day)}</span>
        <Icon name="chevron" size={14} />
      </summary>
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
            const cls = [
              "dp-day",
              cell.inMonth ? "" : "dp-out",
              cell.day === day ? "is-on" : "",
              cell.day === today ? "is-today" : "",
              isOff?.(cell.day) ? "is-off" : "",
            ].filter(Boolean).join(" ");
            return (
              <Link key={cell.day} className={cls} href={dayHref(cell.day)} aria-current={cell.day === day ? "date" : undefined}>
                {Number(cell.day.slice(8, 10))}
                {n > 0 && <span className="dp-dot" aria-hidden />}
              </Link>
            );
          })}
        </div>
        <div className="dp-foot">
          <Link className="dp-today" href={dayHref(today)}>Сегодня</Link>
        </div>
      </div>
    </details>
  );
}
