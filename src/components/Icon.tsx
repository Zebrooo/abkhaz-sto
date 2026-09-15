// Иконки «Абхаз Авто» — те же линейные глифы, что в packages/ui сайта:
// сетка 24, обводка 1.6, круглые концы, цвет из currentColor. Набор здесь
// урезан до того, что рисуют экраны сервиса; новую иконку брать из сайта
// один в один, своих не рисуем.
import type { CSSProperties } from "react";

const PATHS = {
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  car: <><path d="M3 14l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 9l2 5" /><rect x="3" y="14" width="18" height="5" rx="1.2" /><circle cx="7.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></>,
  chart: <><path d="M4 19h16" /><rect x="6" y="11" width="3" height="8" /><rect x="11" y="6" width="3" height="13" /><rect x="16" y="14" width="3" height="5" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  chevDown: <><path d="M6 9l6 6 6-6" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  comment: <><path d="M4 5h16v12H8l-4 4z" /></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  list: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M10.5 5.2h3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  shop: <><path d="M4 7l1-3h14l1 3M4 7v13h16V7M4 7h16" /><path d="M9 11h6" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c1.4-3 3.6-4.5 7-4.5s5.6 1.5 7 4.5" /><circle cx="17" cy="9" r="2.5" /><path d="M22 18c-.6-2-2-3-4-3" /></>,
  wrench: <><path d="M14.5 4.5a4 4 0 0 0 4.9 5l-1.5 1.5L20 13l-7 7-2-2 1.5-1.5a4 4 0 0 0-5-4.9z" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className} style={style}
      fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
