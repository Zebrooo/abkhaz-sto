// Роли сервиса и что каждая открывает. Чистые правила без базы и без сети —
// их читают и экраны, и серверные действия, и тесты.
//
// ДО СИХ ПОР доступ был «всё или ничего»: приложение открывал владелец
// одобренной витрины (lib/shop.ts) и видел всё. Дизайн разводит работу на
// три роли — мастеру не нужна выручка, админу не нужны доступы. Кто есть кто,
// хранит сайт (lib/api/members.ts); здесь — словарь и границы.
//
// ЭТО ПОДСКАЗКА ИНТЕРФЕЙСУ, А НЕ ГРАНИЦА ДОСТУПА. Настоящая проверка — на
// сайте, в каждом маршруте /api/sto/*: он знает роль по actorUserId и
// отказывает сам. Здесь мы решаем, что рисовать, а не что разрешать.

export const STO_ROLES = ["master", "admin", "owner"] as const;
export type StoRole = (typeof STO_ROLES)[number];

/**
 * Вид витрины: автосервис (записи, посты, осмотр) или магазин товаров
 * (заказы, остаток, клиенты по телефону). Роли общие, разделы — разные:
 * у магазина нет ни постов, ни денег по записям, у сервиса — ни заказов.
 */
export type ShopKind = "service" | "goods";

export const STO_ROLE_LABEL: Record<StoRole, string> = {
  master: "Мастер",
  admin: "Админ",
  owner: "Хозяин",
};

/** Чем роль распоряжается — подпись рядом с именем и в «Доступах». */
export const STO_ROLE_ACCESS: Record<StoRole, string> = {
  master: "свой пост, осмотр и отчёты — без денег и настроек",
  admin: "записи, клиенты, расписание, отправка отчётов",
  owner: "деньги, мастера, прайс и доступы",
};

export function isStoRole(v: unknown): v is StoRole {
  return typeof v === "string" && (STO_ROLES as readonly string[]).includes(v);
}

/** Части приложения, доступ к которым зависит от роли. */
export type Section =
  | "shift"        // смена и таймлайн дня
  | "bookings"     // карточка записи, перенос, ручная запись
  | "closeBooking" // отменить запись и отметить неявку — это разговор с клиентом
  | "clients"
  | "inspect"      // осмотр и отчёты
  | "sendReport"   // отправить отчёт клиенту
  | "chat"
  | "services"     // прайс — посмотреть
  | "editServices" // прайс — править
  | "schedule"
  | "masters"
  | "money"
  | "access"       // кто и что видит
  // Магазин товаров (контракт /api/sto/goods/*): разделы Сегодня, Заказы,
  // Товары, Клиенты — одним куском, сайт пускает в них админа и хозяина;
  // вертикаль магазина и новый товар — только хозяину.
  | "goods"
  | "goodsSettings";

const ALLOWED: Record<StoRole, readonly Section[]> = {
  // Мастер: свой пост, осмотр и чат. Прайс — только посмотреть, что сколько
  // стоит; отчёт он передаёт админу, а не клиенту.
  //
  // Отменить запись и отметить «клиент не приехал» мастер не может: и то, и
  // другое клиент увидит у себя, и оба разговора ведёт стойка. Раздел
  // «Записи» ему по-прежнему открыт — он отмечает работу выполненной.
  master: ["bookings", "inspect", "chat", "services"],
  admin: ["shift", "bookings", "closeBooking", "clients", "inspect", "sendReport", "chat", "services", "editServices", "schedule", "masters", "goods"],
  owner: ["shift", "bookings", "closeBooking", "clients", "inspect", "sendReport", "chat", "services", "editServices", "schedule", "masters", "money", "access", "goods", "goodsSettings"],
};

export function can(role: StoRole, section: Section): boolean {
  return ALLOWED[role].includes(section);
}

/**
 * Первый экран роли. У мастера своего поста нет в общей навигации, у хозяина
 * первым делом деньги, у админа — смена. Экран из HOME_PATH обязан быть
 * доступен своей роли — это проверяет тест.
 */
export const HOME_PATH: Record<StoRole, string> = {
  master: "/moi-raboty",
  admin: "/",
  owner: "/svodka",
};

/** Раздел, к которому относится первый экран роли, — для той же проверки. */
export const HOME_SECTION: Record<StoRole, Section> = {
  master: "bookings",
  admin: "shift",
  owner: "money",
};

/**
 * Первый экран магазина — «Сегодня», у всех ролей один: ни денег по
 * записям, ни поста у магазина нет, а новые заказы ждут ответа у всех.
 */
export const GOODS_HOME = "/magazin";

/** Куда вести человека с корня и с закрытого раздела — по виду витрины и роли. */
export function homePath(kind: ShopKind, role: StoRole): string {
  return kind === "goods" ? GOODS_HOME : HOME_PATH[role];
}
