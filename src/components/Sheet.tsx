import Link from "next/link";
import { Icon } from "@/components/Icon";

/**
 * Шторка снизу (на вебе — окно по центру). Открывается и закрывается
 * адресом: экран рисует её, когда в запросе есть свой параметр, а крестик
 * и затемнение — обычные ссылки. Клиентского состояния нет, «назад»
 * в браузере закрывает шторку сам.
 */
export function Sheet({
  closeHref, title, sub, backHref, steps, children, footer, labelledBy = "sheet-title",
}: {
  closeHref: string;
  title: string;
  sub?: string;
  backHref?: string;
  /** Точки шага: [сколько всего, текущий]. */
  steps?: [number, number];
  children: React.ReactNode;
  footer: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <>
      <Link className="scrim" href={closeHref} aria-label="Закрыть" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="sheet-grip"><span /></div>
        <div className="sheet-head">
          {backHref && (
            <Link className="sheet-back" href={backHref} aria-label="Назад">
              <Icon name="chevron" size={18} />
            </Link>
          )}
          <div className="h-mid">
            <div className="h-title" id={labelledBy}>{title}</div>
            {sub && <div className="h-sub">{sub}</div>}
          </div>
          {steps && (
            <div className="sheet-dots" aria-hidden="true">
              {Array.from({ length: steps[0] }, (_, i) => (
                <i key={i} className={`${i <= steps[1] ? "on" : ""}${i === steps[1] ? " at" : ""}`} />
              ))}
            </div>
          )}
          <Link className="sheet-close" href={closeHref} aria-label="Закрыть">
            <span><Icon name="plus" size={18} /></span>
          </Link>
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-foot">{footer}</div>
      </div>
    </>
  );
}
