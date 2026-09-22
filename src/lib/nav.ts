// Навигация по ролям: вкладки телефона, пункты левого меню веба и строки
// экрана «Ещё» — один словарь без базы и сети. Его читают клиентский TabBar,
// SideNav и серверный «Ещё», а тест проверяет, что ни одна роль не получает
// вкладку в закрытый ей раздел и с любого адреса подсвечивается своя вкладка.
//
// Списки — дословно из макетов («Сервис — тач», ROLES[*].tabs и menu;
// «Сервис — веб», WROLES[*].nav): у мастера свой пост и осмотр, у админа
// смена и записи с кнопкой «+», у хозяина деньги и мастера.
import type { Section, StoRole } from "@/lib/access";
import type { IconName } from "@/components/Icon";

export type NavKey =
  | "mywork" | "inspect" | "chats" | "smena" | "today" | "clients" | "dash"
  | "masters" | "more" | "services" | "schedule" | "notifs" | "access" | "report";

/** Раздел, к которому относится пункт — по нему тест сверяет доступ. */
export const NAV_SECTION: Record<NavKey, Section> = {
  mywork: "bookings", inspect: "inspect", chats: "chat", smena: "shift", today: "bookings",
  clients: "clients", dash: "money", masters: "masters", more: "bookings", services: "services",
  schedule: "schedule", notifs: "shift", access: "access", report: "inspect",
};

/**
 * Адреса пунктов — все постоянные. Раньше «Осмотр» был исключением: адрес
 * текущей записи считал layout по записям дня и мастерам — два HTTP к сайту
 * на каждый рендер каждого экрана у всех ролей. Теперь это страница-редиректор
 * /osmotr: тот же расчёт происходит один раз, когда по ссылке действительно
 * перешли.
 */
export const ROUTE: Record<NavKey, string> = {
  mywork: "/moi-raboty", inspect: "/osmotr", chats: "/chat", smena: "/", today: "/segodnya",
  clients: "/klienty", dash: "/svodka", masters: "/mastera", more: "/menu", services: "/uslugi",
  schedule: "/raspisanie", notifs: "/uvedomleniya", access: "/dostupy",
  // Готовые отчёты за период. Раньше своего адреса у пункта не было и он вёл
  // на «Мой пост», где отчёты видны только за сегодня и только мастеру, —
  // хозяин искал готовые отчёты и не находил.
  report: "/otchety",
};

export type TabDef = { key: NavKey | "fab"; label: string; icon: IconName };

/** Вкладки снизу на телефоне. «fab» — красная кнопка новой записи. */
export const TABS: Record<StoRole, readonly TabDef[]> = {
  master: [
    { key: "mywork", label: "Мой пост", icon: "list" },
    { key: "inspect", label: "Осмотр", icon: "camera" },
    { key: "chats", label: "Чат", icon: "comment" },
    { key: "more", label: "Ещё", icon: "menu" },
  ],
  admin: [
    { key: "smena", label: "Смена", icon: "chart" },
    { key: "today", label: "Записи", icon: "list" },
    { key: "fab", label: "", icon: "plus" },
    { key: "clients", label: "Клиенты", icon: "users" },
    { key: "more", label: "Ещё", icon: "menu" },
  ],
  owner: [
    { key: "dash", label: "Деньги", icon: "chart" },
    { key: "today", label: "Записи", icon: "list" },
    { key: "masters", label: "Мастера", icon: "users" },
    { key: "more", label: "Ещё", icon: "menu" },
  ],
};

export type SideDef = { key: NavKey; label: string; icon: IconName };

const SIDE_ITEM: Record<NavKey, SideDef> = {
  dash: { key: "dash", label: "Деньги", icon: "chart" },
  today: { key: "today", label: "Записи", icon: "list" },
  inspect: { key: "inspect", label: "Осмотр и отчёты", icon: "camera" },
  clients: { key: "clients", label: "Клиенты", icon: "users" },
  chats: { key: "chats", label: "Чат", icon: "comment" },
  services: { key: "services", label: "Услуги и цены", icon: "wrench" },
  schedule: { key: "schedule", label: "Расписание", icon: "clock" },
  masters: { key: "masters", label: "Мастера", icon: "user" },
  notifs: { key: "notifs", label: "Уведомления", icon: "bell" },
  access: { key: "access", label: "Доступы", icon: "cog" },
  report: { key: "report", label: "Готовые отчёты", icon: "list" },
  // «Мой пост» в макете был только у мастера. Он нужен всем, кто сам стоит у
  // подъёмника: в маленьком сервисе это хозяин, и без пункта ему негде
  // отметиться, какой подъёмник он занял.
  mywork: { key: "mywork", label: "Мой пост", icon: "list" },
  // В левом меню макета этого пункта нет — он здесь ради полноты словаря.
  smena: { key: "smena", label: "Смена", icon: "chart" },
  more: { key: "more", label: "Ещё", icon: "menu" },
};

/**
 * «Осмотр и отчёты» ведёт на осмотр текущей машины, и отчётов в нём не
 * видно; «Готовые отчёты» рядом — постоянный адрес списка. Два пункта, а не
 * один, потому что это две разные работы: одна про машину на подъёмнике,
 * вторая про то, что уже сделано.
 */
const SIDE_KEYS: Record<StoRole, readonly NavKey[]> = {
  master: ["inspect", "report", "chats"],
  admin: ["today", "mywork", "inspect", "report", "clients", "chats", "services", "schedule", "notifs"],
  owner: ["dash", "today", "mywork", "inspect", "report", "clients", "chats", "masters", "services", "schedule", "notifs", "access"],
};

/** Левое меню рабочего места — в порядке макета. */
export function sideNav(role: StoRole): readonly SideDef[] {
  return SIDE_KEYS[role].map(k => SIDE_ITEM[k]);
}

/** Строки «Ещё»: что не поместилось во вкладки. «shop» — витрина на сайте. */
export type MenuKey = "mywork" | "inspect" | "report" | "clients" | "services" | "schedule" | "masters" | "chats" | "notifs" | "access" | "shop";

export const MENU: Record<StoRole, readonly MenuKey[]> = {
  master: ["inspect", "report", "chats", "services"],
  admin: ["mywork", "inspect", "report", "services", "schedule", "masters", "chats", "notifs", "shop"],
  // «Мой пост» — и хозяину: в сервисе на два подъёмника он сам принимает
  // машину, и отметиться ему больше негде. Готовые отчёты нужны всегда: на
  // телефоне это его единственный путь к ним.
  //
  // «Клиенты» и «Чат» хозяину открыты правами, но ссылок на них у него не
  // было НИГДЕ: ни во вкладках, ни в левом меню, ни здесь. На телефоне
  // карточка клиента и переписка были недостижимы — «базы клиентов не вижу».
  owner: ["mywork", "clients", "report", "chats", "services", "schedule", "masters", "notifs", "access", "shop"],
};

/**
 * Какому пункту принадлежит адрес. Карточка записи и календарь — «Записи»,
 * осмотр и отчёт внутри записи — «Осмотр», неизвестное — «Ещё».
 */
export function navKeyOf(path: string): NavKey {
  if (path === "/") return "smena";
  if (/^\/zapis\/\d+\/(osmotr|otchet)/.test(path)) return "inspect";
  // «Осмотр без записи» — тоже вкладка «Осмотр»: с неё туда и приходят.
  if (path.startsWith("/osmotr")) return "inspect";
  if (path.startsWith("/segodnya") || path.startsWith("/kalendar") || path.startsWith("/zapis")) return "today";
  const first = "/" + path.split("/")[1];
  const found = (Object.keys(ROUTE) as NavKey[]).find(k => ROUTE[k] === first);
  return found ?? "more";
}

/**
 * Куда «поднимается» пункт, если у роли нет для него вкладки: у мастера
 * запись — часть «Моего поста», у админа осмотр — часть «Записей», а всё
 * служебное — в «Ещё». Цепочка всегда кончается на «Ещё»: оно есть у всех.
 */
const PARENT: Partial<Record<NavKey, NavKey>> = {
  // Готовые отчёты у всех трёх ролей лежат в «Ещё» — туда и поднимаются.
  inspect: "today", report: "more", today: "mywork", smena: "dash", dash: "more", mywork: "more",
  clients: "more", masters: "more", services: "more", schedule: "more", notifs: "more", access: "more", chats: "more",
};

/** Вкладка, которую подсветить на этом адресе у этой роли. */
export function activeTab(role: StoRole, path: string): NavKey {
  const keys = TABS[role].map(t => t.key);
  let key = navKeyOf(path);
  while (!keys.includes(key)) key = PARENT[key] ?? "more";
  return key;
}

/** Все пункты, которые роль видит где-либо, — для проверки доступа тестом. */
export function visibleKeys(role: StoRole): NavKey[] {
  const keys = new Set<NavKey>();
  for (const t of TABS[role]) if (t.key !== "fab") keys.add(t.key);
  for (const s of SIDE_KEYS[role]) keys.add(s);
  for (const m of MENU[role]) if (m !== "shop") keys.add(m);
  return [...keys];
}
