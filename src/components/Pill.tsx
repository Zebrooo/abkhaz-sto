import type { PillSpec } from "@/lib/goods/orders";

/**
 * Пилюля состояния на карточках магазина: текст и тон из чистых правил
 * (lib/goods/*). Тон «neu» — без модификатора, остальные — существующие
 * токены площадки (красный, янтарный, зелёный, чернильный).
 */
export function Pill({ spec }: { spec: PillSpec }) {
  return <span className={spec.tone === "neu" ? "pill" : `pill pill-${spec.tone}`}>{spec.text}</span>;
}

export function Pills({ specs }: { specs: readonly PillSpec[] }) {
  if (specs.length === 0) return null;
  return <div className="pills">{specs.map((s, i) => <Pill key={`${i}-${s.text}`} spec={s} />)}</div>;
}
