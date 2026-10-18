# СРМ владельца магазина товаров в приложении «Бизнес» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец магазина товаров (цветы, электроника) входит в «АбхазАвто Бизнес» своим номером и видит экраны Сегодня · Заказы · Товары · Клиенты · Ещё по артборду «СРМ владельца»; проводит заказ по цепочке статусов, правит остаток и цену, заводит заказ по звонку — всё через контракт `/api/sto/goods/*` сайта (кусок G).

**Architecture:** Витрина рубрики `goods` попадает в тот же контекст, что и сервис (`lib/shop.ts` → `kind: "service" | "goods"`), выбор витрины у владельца с несколькими — кука `sto-shop`. Навигация (`lib/nav.ts`) получает второй набор вкладок по виду витрины; гейт `requireGoods` уводит сервисные экраны с магазина и наоборот. Данные магазина приезжают только с сайта (`lib/api/goods.ts`, подписанный запрос `site-api.ts`); чистые правила отображения — `lib/goods/*` под vitest; экраны — серверные компоненты, шторки открываются адресом, действия — серверные (`goods-actions.ts`).

**Tech Stack:** Next.js 16 (App Router, серверные компоненты и действия), `@zebrooo/service-ticket`, Vitest, pnpm. Схемы БД здесь нет; к базе — только чтение `shops` под сервисным ключом, как раньше.

**Контракт:** `abkhaz-auto` → `origin/feat/goods-crm-items-clients:docs/sto-api-goods-2026-10-18.md` (типы и 15 маршрутов); спека решений — там же `docs/superpowers/specs/2026-10-18-goods-crm-design.md`. Дизайн — артборд `project/OwnerCrm.dc.html` канвы https://claude.ai/artifact/7ju8eTFDivxAXUoESNQ3LW.

## Global Constraints

- Ветка `claude/goods-crm-7076ca` от `origin/main` (6e82227), PR в `main` репозитория `Zebrooo/abkhaz-sto`; ни одного коммита в `main`.
- Коммиты заканчиваются `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; описание PR — `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Схемы БД в приложении нет и не будет (AGENTS.md): новых таблиц, RPC и миграций — ноль. Из `shops` читаем только колонки, которые есть в `origin/main` сайта (`rubric`, `couriers` — миграции 20260925122857 и 20260905074154). `goods_vertical` из базы НЕ читаем — вертикаль приезжает с сайта (`/goods/settings`, `/goods/today`).
- Типы контракта копируются в `src/lib/api/goods.ts` буква в букву (имена полей из §1 контракта), ошибки — коды `ApiErrorCode` из `site-api.ts`, сообщения сайта показываются как есть.
- Вкладки магазина дословно по артборду: **Сегодня · Заказы · Товары · Клиенты · Ещё**; без «+». Оболочка (Flutter) панель не рисует, индексы её вкладок не трогаем — все правки только в вебе.
- Экраны — серверные компоненты; шторки открываются адресом (`?do=`, `?edit=`), клиентского кода не добавляем (есть только `TabBar`/`SideNav` для подсветки). Сканера штрих-кодов в репозитории нет → серийный номер вводится руками.
- Новых цветов, радиусов и теней не заводим: пилюли статусов — из существующих токенов (`--accent`, `--danger-bg`, `--ok-bg`/`--green-dark`, `--tag-urgent`, `--ink`, `--bg-2`).
- Комментарии в коде — по-русски, объясняют «почему», в стиле репозитория; никаких обёрток ради одного значения и флагов «смонтировано».
- Проверка перед PR: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` (то же гоняет джоба `checks`).
- Адреса экранов магазина: `/magazin` (Сегодня), `/zakazy`, `/zakazy/novyi`, `/zakazy/[id]`, `/tovary`, `/pokupateli` (вкладка «Клиенты»), `/menu` (общий «Ещё»).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `src/lib/access.ts` (+test) | `ShopKind`, разделы `goods` / `goodsSettings`, `GOODS_HOME`, `homePath(kind, role)` |
| `src/lib/couriers.ts` (+test) | чистый разбор `shops.couriers` → `ShopCourier[]` |
| `src/lib/shop-choice.ts` (+test), `src/lib/shop-cookie.ts` | кодек и кука выбранной витрины `sto-shop` |
| `src/lib/shop.ts` (+test) | витрины обеих рубрик, `kind`, `couriers`, выбор по куке |
| `src/lib/context.ts` | `requireSection` уводит магазин на `/magazin`, новый `requireGoods` |
| `src/lib/nav.ts` (+test) | вкладки/меню/левое меню магазина, `tabsFor`, `sideNav(kind, role)`, `activeTab(kind, role, path)` |
| `src/lib/api/site-api.ts` | `sitePostForm` — multipart для фото товара |
| `src/lib/api/goods.ts` (+test) | типы контракта и 16 функций на 15 маршрутов |
| `src/lib/goods/orders.ts` (+test) | виды, подписи статусов, главное действие, пилюли, поиск, WhatsApp |
| `src/lib/goods/items.ts` (+test) | виды, пилюля остатка, видимость, поиск |
| `src/lib/goods/clients.ts` (+test) | виды по вертикали, строка клиента, сегменты, разбор дат |
| `src/lib/goods/today.ts` (+test) | подписка, витрина, реклама, KPI |
| `src/lib/goods/order-form.ts` (+test) | позиции в адресе, разбор формы заказа по звонку, серийники |
| `src/app/(app)/goods-actions.ts` (+test) | серверные действия магазина |
| `src/app/(app)/shop-actions.ts` | переключение витрины |
| `src/components/Thumb.tsx`, `Pill.tsx` | обложка товара, пилюля |
| `src/components/TabBar.tsx`, `SideNav.tsx`, `TopBar.tsx`, `ScreenHead.tsx`, `src/app/(app)/layout.tsx` | каркас по виду витрины |
| `src/app/(app)/magazin/page.tsx` | Сегодня |
| `src/app/(app)/zakazy/page.tsx`, `zakazy/[id]/page.tsx`, `zakazy/novyi/page.tsx` | Заказы, Заказ, Новый заказ |
| `src/app/(app)/tovary/page.tsx` | Товары |
| `src/app/(app)/pokupateli/page.tsx` | Клиенты |
| `src/app/(app)/menu/page.tsx`, `menu/GoodsMenu.tsx` | «Ещё» магазина |
| `src/app/globals.css` | пилюли, KPI, карточки заказа/товара/клиента, переключатель витрины |
| `docs/API-sushchnosti.md`, `README.md` | зеркало контракта, таблица экранов |

---

### Task 1: Доступ и витрина — вид `goods`, курьеры, выбор витрины

**Files:**
- Modify: `src/lib/access.ts`, `src/lib/access.test.ts`
- Create: `src/lib/couriers.ts`, `src/lib/couriers.test.ts`, `src/lib/shop-choice.ts`, `src/lib/shop-choice.test.ts`, `src/lib/shop-cookie.ts`
- Modify: `src/lib/shop.ts`, `src/lib/shop.test.ts`
- Modify: `src/lib/context.ts`

**Interfaces:**
- Produces: `ShopKind = "service" | "goods"`; `Section` += `"goods" | "goodsSettings"`; `GOODS_HOME = "/magazin"`; `homePath(kind, role)`; `ServiceShop.kind`, `ServiceShop.couriers: ShopCourier[]`; `ShopCourier = { id; name; phone: string | null }`; `parseCouriers(raw: unknown)`; `SHOP_COOKIE`, `parseShopChoice(raw, userId)`, `serializeShopChoice(shopId, userId)`; `readShopChoice(userId)`, `saveShopChoice(shopId, userId)`; `requireGoods(section?: Section)`.

- [ ] **Step 1: Тесты доступа** — в `access.test.ts` добавить:

```ts
import { GOODS_HOME, homePath } from "@/lib/access";

describe("магазин товаров", () => {
  it("раздел магазина открыт админу и хозяину, мастеру — нет", () => {
    expect(can("master", "goods")).toBe(false);
    expect(can("admin", "goods")).toBe(true);
    expect(can("owner", "goods")).toBe(true);
  });
  it("настройки магазина (вертикаль, новый товар) — только хозяину", () => {
    expect(can("admin", "goodsSettings")).toBe(false);
    expect(can("owner", "goodsSettings")).toBe(true);
  });
  it("первый экран магазина один для всех ролей, сервиса — по роли", () => {
    expect(homePath("goods", "admin")).toBe(GOODS_HOME);
    expect(homePath("goods", "owner")).toBe("/magazin");
    expect(homePath("service", "owner")).toBe(HOME_PATH.owner);
  });
});
```

- [ ] **Step 2: Реализация в `access.ts`**

```ts
/** Вид витрины: автосервис (записи) или магазин товаров (заказы). */
export type ShopKind = "service" | "goods";

export type Section =
  | … // как было
  | "goods"          // СРМ магазина товаров целиком: сегодня, заказы, товары, клиенты
  | "goodsSettings"; // вертикаль магазина и новый товар — хозяину

const ALLOWED: Record<StoRole, readonly Section[]> = {
  master: ["bookings", "inspect", "chat", "services"],
  admin: [...как было, "goods"],
  owner: [...как было, "goods", "goodsSettings"],
};

/** Первый экран магазина — «Сегодня», у всех ролей один: денег и постов тут нет. */
export const GOODS_HOME = "/magazin";

export function homePath(kind: ShopKind, role: StoRole): string {
  return kind === "goods" ? GOODS_HOME : HOME_PATH[role];
}
```

- [ ] **Step 3: Курьеры — тест и модуль**

`couriers.test.ts`:
```ts
import { parseCouriers } from "@/lib/couriers";
it("берёт только строки с id и именем, телефон — строкой или null", () => {
  expect(parseCouriers([{ id: "c1", name: "Амра", phone: "+79400000001" }, { id: "c2", name: "Без телефона" }, { name: "без id" }, "мусор", null]))
    .toEqual([{ id: "c1", name: "Амра", phone: "+79400000001" }, { id: "c2", name: "Без телефона", phone: null }]);
});
it("не массив — пусто", () => { expect(parseCouriers(null)).toEqual([]); expect(parseCouriers("x")).toEqual([]); });
```

`couriers.ts` (без server-only):
```ts
/** Свой курьер магазина — строка shops.couriers (jsonb сайта, src/lib/delivery/types.ts: ShopCourier). */
export type ShopCourier = { id: string; name: string; phone: string | null };

/** Кривое отбрасываем: колонку пишет кабинет сайта, и верить её форме нельзя. */
export function parseCouriers(raw: unknown): ShopCourier[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopCourier[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, name, phone } = r as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) continue;
    out.push({ id, name: name.trim(), phone: typeof phone === "string" && phone ? phone : null });
  }
  return out;
}
```

- [ ] **Step 4: Кодек куки витрины** — `shop-choice.ts` (чисто, как `admin-shop.ts`): `SHOP_COOKIE = "sto-shop"`, `serializeShopChoice(shopId, userId) = \`${shopId}|${userId}\``, `parseShopChoice(raw, userId): number | null` (чужая учётка, мусор → null). Тест `shop-choice.test.ts`: своя → id; чужая учётка → null; `"abc|u1"` → null. `shop-cookie.ts` (server-only) — копия `admin-shop-cookie.ts` с именем `SHOP_COOKIE`, `readShopChoice` под `cache`, `saveShopChoice`, `clearShopChoice`, срок 180 дней (это выбор рабочего места, а не визит).

- [ ] **Step 5: Тесты `shop.ts`** — в `shop.test.ts` добавить мок `@/lib/shop-cookie` (`readShopChoice: vi.fn(async () => null)`) и случаи:

```ts
const GOODS_ROW = { ...ROW, id: 9, name: "Цветы «Лилия»", rubric: "goods", couriers: [{ id: "c1", name: "Амра", phone: null }] };
it("витрина рубрики goods — магазин: kind goods, курьеры разобраны", async () => {
  mocks.state.profile = { phone: null };
  mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }, { ...GOODS_ROW, user_id: "admin-1" }];
  const shops = await myShops();
  expect(shops.map(s => s.kind)).toEqual(["service", "goods"]);
  expect(shops[1].couriers).toEqual([{ id: "c1", name: "Амра", phone: null }]);
});
it("кука выбора: текущей становится выбранная витрина, а не первая", async () => {
  mocks.state.profile = { phone: null };
  mocks.state.ownedRows = [{ ...ROW, user_id: "admin-1" }, { ...GOODS_ROW, user_id: "admin-1" }];
  mocks.readShopChoice.mockResolvedValue(9);
  expect((await current())?.id).toBe(9);
});
it("кука на чужую или пропавшую витрину — первая, как без куки", …);
it("мастер по списку сотрудников в магазине товаров — витрины не получает", …); // memberships [{shopId: 9, role: "master", active: true}], memberRows [GOODS_ROW] → []
```
`current()` — как `myShops()`, но `currentServiceShop`.

- [ ] **Step 6: Реализация `shop.ts`**
  - `ServiceShop` += `kind: ShopKind`, `couriers: ShopCourier[]`; `ShopRow` += `couriers: unknown`; `COLUMNS` += `, couriers`.
  - `toShop`: `kind: r.rubric === "goods" ? "goods" : "service"`, `couriers: parseCouriers(r.couriers)`.
  - Три запроса `.eq("rubric", "service")` → `.in("rubric", RUBRICS)` где `const RUBRICS = ["service", "goods"]`.
  - Сотрудники: `memberRows.flatMap(r => { const m = byId.get(r.id) ?? null; /* в магазине товаров роли «мастер» нет (контракт goods §0): такая строка — ошибка данных, витрину не открываем */ if (r.rubric === "goods" && m?.role === "master") return []; return [toShop(r, false, m)]; })`.
  - `currentServiceShop`: `const shops = await myServiceShops(); if (shops.length === 0) return null; const user = await getServerUser(); const chosen = user ? await readShopChoice(user.id) : null; return shops.find(s => s.id === chosen) ?? shops[0];` Комментарий: несколько витрин у одного человека — сервис и магазин — теперь обычное дело; выбор живёт в куке, а не в адресе, по тем же причинам, что примерка роли.

- [ ] **Step 7: `context.ts`** — `requireSection`: после `if (!ctx) return null;` добавить `if (ctx.shop.kind === "goods") redirect(GOODS_HOME);` (экраны сервиса магазину не нужны: там нет ни записей, ни постов). Новый:

```ts
/** Гейт экрана магазина: сервис — на свой первый экран, роль без раздела — на «Сегодня» магазина. */
export async function requireGoods(section: Section = "goods"): Promise<ServiceContext | null> {
  const ctx = await serviceContext();
  if (!ctx) return null;
  if (ctx.shop.kind !== "goods") redirect(HOME_PATH[ctx.role]);
  if (!can(ctx.role, section)) redirect(GOODS_HOME);
  return ctx;
}
```

- [ ] **Step 8: Прогнать** `pnpm vitest run src/lib/access src/lib/shop src/lib/couriers src/lib/shop-choice` — зелёные; `pnpm exec tsc --noEmit` — пока падает на `nav.ts`/компонентах? Нет: `kind` добавочный, tsc зелёный.
- [ ] **Step 9: Commit** `feat(витрина): рубрика goods в контексте, курьеры и выбор витрины кукой`

---

### Task 2: Навигация магазина и каркас

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Modify: `src/components/TabBar.tsx`, `src/components/SideNav.tsx`, `src/components/TopBar.tsx`, `src/components/ScreenHead.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/menu/page.tsx` (ветка магазина — заглушка до Task 12), `src/app/(app)/page.tsx` (без правок: `requireSection("shift")` сам уводит магазин).

**Interfaces:**
- Produces: `NavKey` += `"gtoday" | "orders" | "items" | "gclients"`; `ROUTE.gtoday = "/magazin"`, `ROUTE.orders = "/zakazy"`, `ROUTE.items = "/tovary"`, `ROUTE.gclients = "/pokupateli"`; `GOODS_TABS`; `tabsFor(kind, role)`; `sideNav(kind, role)`; `activeTab(kind, role, path)`; `visibleKeys(kind, role)`; `GoodsMenuKey = "shop" | "subscription" | "vertical"`, `goodsMenu(role)`.

- [ ] **Step 1: Тесты** — в `nav.test.ts` поправить вызовы (`activeTab("service", r, p)`, `visibleKeys("service", r)`, `sideNav("service", r)`) и добавить:

```ts
describe("вкладки магазина товаров", () => {
  it("дословно по артборду, без «+», одни на обе роли", () => {
    expect(tabsFor("goods", "owner").map(t => t.label)).toEqual(["Сегодня", "Заказы", "Товары", "Клиенты", "Ещё"]);
    expect(tabsFor("goods", "admin")).toEqual(tabsFor("goods", "owner"));
    expect(tabsFor("goods", "owner").some(t => t.key === "fab")).toBe(false);
  });
  it("ни один пункт магазина не ведёт в закрытый роли раздел", () => {
    for (const r of ["admin", "owner"] as const) for (const k of visibleKeys("goods", r)) expect(can(r, NAV_SECTION[k]), `${r} ${k}`).toBe(true);
  });
  it("первый экран магазина подсвечивает «Сегодня», карточки — свои вкладки", () => {
    expect(activeTab("goods", "owner", GOODS_HOME)).toBe("gtoday");
    expect(activeTab("goods", "owner", "/zakazy/1042")).toBe("orders");
    expect(activeTab("goods", "owner", "/zakazy/novyi?step=1")).toBe("orders");
    expect(activeTab("goods", "admin", "/tovary?v=low")).toBe("items");
    expect(activeTab("goods", "admin", "/pokupateli")).toBe("gclients");
    expect(activeTab("goods", "admin", "/menu")).toBe("more");
    expect(activeTab("goods", "admin", "/chto-to")).toBe("more");
  });
  it("левое меню магазина — те же четыре раздела", () => {
    expect(sideNav("goods", "owner").map(s => s.key)).toEqual(["gtoday", "orders", "items", "gclients"]);
  });
  it("«Ещё» магазина: вертикаль — только хозяину", () => {
    expect(goodsMenu("owner")).toContain("vertical");
    expect(goodsMenu("admin")).not.toContain("vertical");
  });
});
```

- [ ] **Step 2: Реализация `nav.ts`**

```ts
import { GOODS_HOME, type Section, type ShopKind, type StoRole } from "@/lib/access";

export type NavKey = …как было… | "gtoday" | "orders" | "items" | "gclients";
NAV_SECTION: gtoday: "goods", orders: "goods", items: "goods", gclients: "goods"
ROUTE: gtoday: GOODS_HOME, orders: "/zakazy", items: "/tovary", gclients: "/pokupateli"

/** Вкладки магазина товаров — дословно артборд «СРМ владельца»; «+» нет: новый заказ — кнопка на «Заказах». */
export const GOODS_TABS: readonly TabDef[] = [
  { key: "gtoday", label: "Сегодня", icon: "shop" },
  { key: "orders", label: "Заказы", icon: "list" },
  { key: "items", label: "Товары", icon: "box" },
  { key: "gclients", label: "Клиенты", icon: "users" },
  { key: "more", label: "Ещё", icon: "menu" },
];
export function tabsFor(kind: ShopKind, role: StoRole): readonly TabDef[] { return kind === "goods" ? GOODS_TABS : TABS[role]; }

SIDE_ITEM += gtoday: { key: "gtoday", label: "Сегодня", icon: "shop" }, orders: { …"Заказы", "list" }, items: { …"Товары", "box" }, gclients: { …"Клиенты", "users" }
const GOODS_SIDE_KEYS: readonly NavKey[] = ["gtoday", "orders", "items", "gclients"];
export function sideNav(kind: ShopKind, role: StoRole): readonly SideDef[] { return (kind === "goods" ? GOODS_SIDE_KEYS : SIDE_KEYS[role]).map(k => SIDE_ITEM[k]); }

/** Строки «Ещё» магазина: витрина на сайте, подписка; вертикаль — хозяину. */
export type GoodsMenuKey = "shop" | "subscription" | "vertical";
export function goodsMenu(role: StoRole): readonly GoodsMenuKey[] { return role === "owner" ? ["shop", "subscription", "vertical"] : ["shop", "subscription"]; }

PARENT += gtoday: "more", orders: "more", items: "more", gclients: "more"
export function activeTab(kind: ShopKind, role: StoRole, path: string): NavKey { const keys = tabsFor(kind, role).map(t => t.key); … }
export function visibleKeys(kind: ShopKind, role: StoRole): NavKey[] { если goods — вкладки + GOODS_SIDE_KEYS; иначе как было }
```
`navKeyOf` не меняется: первый сегмент `/zakazy`, `/tovary`, `/pokupateli`, `/magazin` находится через `ROUTE`.

- [ ] **Step 3: Компоненты**
  - `TabBar({ kind, role, newHref })`: `activeTab(kind, role, path)`, `tabsFor(kind, role)`.
  - `SideNav({ kind, role, siteUrl, unread })`: `sideNav(kind, role)`; подпись в подвале для магазина: «Заказы с витрины приходят сюда сразу. Вход — общий с abkhaz-auto.ru.»
  - `TopBar({ shopName, kind, role, newHref, unread, shops })`: для goods — `logo-sub` «Магазин», поиск `action="/pokupateli"` с placeholder «Клиент, телефон или № заказа», кнопка «Новый заказ», колокола нет. `shops: { id: number; name: string; kind: ShopKind }[]` — если больше одной, вместо `<div className="shop-switch">` рисуем `<details className="shop-switch shop-menu"><summary>{shopName}</summary><div className="shop-menu-list">{shops.map(s => <form action={switchShopAction}><input type="hidden" name="shopId" value={s.id}/><button type="submit" aria-current={s.id===current}>{s.name}<small>{s.kind === "goods" ? "магазин" : "автосервис"}</small></button></form>)}</div></details>` (Task 12 даёт действие; здесь — проп и разметка).
  - `ScreenHead`: колокол только `ctx.shop.kind === "service" && can(ctx.role, "shift")`.
  - `layout.tsx`: `const kind = shop.kind; const newHref = kind === "goods" ? "/zakazy/novyi" : \`/kalendar/novaya?d=${day}\`; const pending = kind === "goods" ? 0 : await countPending(shop.id);` передать `kind` в TopBar/SideNav/TabBar; `shops` — `await myServiceShops()` (кэш на запрос, второй вызов бесплатный). Текст карточки «Организации нет»: «…нет одобренной витрины с рубрикой «Автосервис» или «Товары»…».
  - `menu/page.tsx`: в начале `if (ctx.shop.kind === "goods") return <GoodsMenu ctx={ctx} sp={sp} />;` — компонент пока заглушка с заголовком «Ещё» и выходом (полный — Task 12).

- [ ] **Step 4: Прогнать** `pnpm vitest run src/lib/nav`, `pnpm exec tsc --noEmit`, `pnpm lint`.
- [ ] **Step 5: Commit** `feat(навигация): вкладки магазина товаров — Сегодня · Заказы · Товары · Клиенты · Ещё`

---

### Task 3: Клиентский слой `src/lib/api/goods.ts`

**Files:**
- Modify: `src/lib/api/site-api.ts` (+ `sitePostForm`), `src/lib/api/site-api.test.ts`
- Create: `src/lib/api/goods.ts`, `src/lib/api/goods.test.ts`

**Interfaces:**
- Produces (имена — как в контракте §1): `GoodsVertical`, `GoodsOrderStatus`, `GoodsOrderView`, `GoodsOrderSource`, `GoodsPayment`, `GoodsOrderItemOut`, `GoodsOrderOut`, `GoodsOrderCounts`, `GoodsStockMode`, `GoodsVisibility`, `GoodsItemOut`, `GoodsItemCounts`, `GoodsCategoryCount`, `GoodsItemView = "all" | "low" | "hidden"`, `GoodsClientDate`, `GoodsClientSegment`, `GoodsClientOut`, `GoodsClientView`, `GoodsClientCounts`, `GoodsTodayOut`, `CreateGoodsOrderInput` (§3.1 без shopId/actorUserId), `TransitionGoodsOrderInput` (§3.2), `CreateGoodsItemInput` (§4.1).
- Функции (все `(input) => Promise<ApiResult<…>>`, `shopId`/`actorUserId` в input):
  `fetchGoodsToday`, `fetchGoodsSettings`, `saveGoodsSettings`, `fetchGoodsOrders({…, view})`, `fetchGoodsOrder({…, orderId})`, `createGoodsOrder`, `transitionGoodsOrder` → `{ order, clientMessage }`, `extendGoodsReserve({…, orderId, days?})`, `saveGoodsOrderNote({…, orderId, note})`, `fetchGoodsItems({…, view?, category?})`, `saveGoodsStock({…, listingId, mode?, qty?, lowThreshold?})`, `saveGoodsPrice({…, listingId, price})`, `uploadGoodsPhoto({…, file: File})` → `{ stagedId, url }`, `createGoodsItem`, `fetchGoodsClients({…, view?})`, `saveGoodsClientNote({…, phone, name?, note?, dates?})`.
- Константы: `GOODS_VERTICALS`, `isGoodsVertical`, `ORDER_VIEWS`, `isOrderView`, `ITEM_VIEWS`, `isItemView`, `CLIENT_VIEWS`, `isClientView`, `GOODS_STOCK_MODES`, `isStockMode`, `GOODS_PAYMENTS = ["on_receipt","transfer","link"]`.

- [ ] **Step 1: `sitePostForm`** — в `site-api.ts` `attempt` принимает `body: unknown | FormData`: если `body instanceof FormData` — отправляем как есть и `content-type` не ставим (границу multipart выставит fetch). `export function sitePostForm<T>(path: string, form: FormData)` → `request("POST", path, { body: form, timeoutMs: WRITE_TIMEOUT_MS })`. Тест в `site-api.test.ts`: `sitePostForm("goods/items/photo", fd)` — у fetch `body` тот же FormData, в заголовках нет `content-type`.
- [ ] **Step 2: Тесты `goods.test.ts`** (мок `@/lib/api/site-api`): каждая функция зовёт нужный путь с нужными параметрами:

```ts
it("GET-ы: путь и query", async () => {
  await fetchGoodsOrders({ shopId: 7, actorUserId: "u1", view: "work" });
  expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/orders", { shopId: 7, actorUserId: "u1", view: "work" });
  await fetchGoodsItems({ shopId: 7, actorUserId: "u1", view: "low", category: "elektronika" });
  expect(mocks.siteGet).toHaveBeenLastCalledWith("goods/items", { shopId: 7, actorUserId: "u1", view: "low", category: "elektronika" });
  … today, settings, orders/item, clients
});
it("POST-ы: путь и тело как есть", …transition → "goods/orders/transition" с { shopId, actorUserId, orderId, status, paid: true, serials }…);
it("фото — multipart через sitePostForm с shopId и actorUserId в форме", …);
it("виды распознаются, чужие — нет", () => { expect(isOrderView("closed")).toBe(true); expect(isOrderView("all")).toBe(false); … });
```
- [ ] **Step 3: Реализация** — шапка модуля: что это зеркало контракта `docs/sto-api-goods-2026-10-18.md`, зачем виды константами (чипы экранов и проверка адреса), почему `price` в позиции заказа по звонку не шлём (цена объявления — решение спеки §7). Типы — дословно из §1 с комментариями контракта.
- [ ] **Step 4: Прогнать** `pnpm vitest run src/lib/api`, tsc.
- [ ] **Step 5: Commit** `feat(api): клиентский слой /api/sto/goods/* по контракту куска G`

---

### Task 4: Чистые правила экранов `src/lib/goods/*`

**Files:**
- Create: `src/lib/goods/orders.ts` (+test), `items.ts` (+test), `clients.ts` (+test), `today.ts` (+test), `order-form.ts` (+test)
- Create: `src/lib/goods/fixtures.ts` — образцы `GoodsOrderOut`/`GoodsItemOut`/`GoodsClientOut`/`GoodsTodayOut` из артборда и §3.3 контракта (только для тестов; без server-only).

**Interfaces:**
- `orders.ts`: `ORDER_VIEW_LABEL: Record<GoodsOrderView, string> = { new: "Новые", work: "В работе", ready: "Готовы", delivery: "Доставка", closed: "Закрыты" }`; `type Tone = "dng" | "warn" | "ok" | "ink" | "neu"`; `type PillSpec = { text: string; tone: Tone }`; `statusPill(o, now)`; `orderPills(o, now): PillSpec[]` (передача, адрес, открытка, оплата, резерв); `whenLabel(iso, now)` («сегодня 11:00», «завтра 10:00», «19.10 · 10:00»); `handoverLabel(o, now)` («доставка · сегодня 11:00» / «самовывоз · 13:30» / «доставка · завтра 10:00–12:00»); `orderTitle(o)` (первая позиция, «+ ещё 2»); `itemsLine(o)` («25 шт · 6 250 ₽ · с витрины»); `sourceLabel`; `PAYMENT_LABEL`; `type OrderAction = { status: GoodsOrderStatus; label: string; needs: "none" | "readyBy" | "courier" | "deliver" }`; `actionsFor(o): OrderAction[]` — первое главное; `matchOrder(o, q)`; `whatsappUrl(phone, text?)`; `phoneDigits(phone)`; `upcomingTime(o)` («11:00» или «—»); `slaLabel(hours)` («ответить до 15 мин» / «до 2 ч»).
- `items.ts`: `ITEM_VIEW_LABEL = { all: "Все", low: "Кончаются", hidden: "Скрыто" }`; `stockPill(item): PillSpec` («2 шт» ok · «1 шт · кончается» dng · «0 шт · скрыт с витрины» neu · «есть сегодня» ok · «под заказ» neu · «остаток не ведётся» neu); `reservePill(item): PillSpec | null` («1 в резерве»); `visibilityLine(item)` («на витрине» · «скрыт остатком 0» · «снят владельцем — вернуть в кабинете сайта» · «снят модерацией»); `STOCK_MODE_LABEL`; `matchItem(item, q)`; `itemCardUrl(slug)`.
- `clients.ts`: `CLIENT_VIEW_LABEL = { all: "Все", regular: "Постоянные", holidays: "Праздники скоро", dormant: "Давно не брали", warranty: "Гарантия кончается" }`; `clientViews(vertical): GoodsClientView[]` (warranty только у electronics, holidays — у всех); `clientLine(c, now)` («2 заказа · 17 400 ₽ · последний сегодня»); `clientPills(c): PillSpec[]` (ближайшая дата warn «день рождения мамы · 19.10», постоянный ok, давно neu, гарантия dng «гарантия до 02.11»); `parseClientDates(text): { ok: true; dates: GoodsClientDate[] } | { ok: false; error }` — строки «ДД.ММ подпись», «апгрейд» в начале подписи → `upgrade_offered`; `formatClientDates(dates)`; `matchGoodsClient(c, q)`; `dayLabelMMDD("10-19") = "19.10"`.
- `today.ts`: `subscriptionLine(sub, now)` («до 24.10 · ещё 6 дней» / «истекла 10.10» / «кончается сегодня» / «срок не задан»); `subscriptionTone(sub)`; `storefrontLine(shop)` («Сухум · витрина опубликована» / «витрина не опубликована» / «витрина на проверке» / «витрина скрыта»); `adsLine(ads)` («идёт · остаток 420 ₽ · хватит на 1 дн.»); `monthLabel(from)` («октябрь»); `regionLabel(slug)` — словарь регионов Абхазии из сайта (sukhum→Сухум, gagra→Гагра, gudauta→Гудаута, pitsunda→Пицунда, ochamchira→Очамчира, tkuarchal→Ткуарчал, gal→Гал, novyi-afon→Новый Афон, прочее — слаг как есть).
- `order-form.ts`: `type Picked = { listingId: number; qty: number }`; `parseItemsParam(raw): Picked[]` («7701:1,7702:2», qty 1…999, дубли схлопываются); `serializeItemsParam(items)`; `withQty(items, listingId, delta)`; `parseOrderForm(fd: FormData): { ok: true; input: CreateGoodsOrderInput } | { ok: false; error: string }` — поля: `items`, `name`, `phone`, `method`, `address`, `city?`, `deliveryPrice`, `deliveryDate`, `windowFrom`, `windowTo`, `pickupAt`, `payment`, `recipientName`, `recipientPhone`, `card`, `composition`, `note`, `reserveDays`, `accept`; `parseSerials(fd, items): { listingId; serial }[]` (поля `serial_<listingId>`, до 40 знаков, пустые пропускаем); `formEcho(fd)` — какие поля вернуть в адрес при отказе (`n, ph, addr, dd, wf, wt, pay, method, rn, rp, card, comp, note, days`).

- [ ] **Step 1: Фикстуры** — `fixtures.ts`: `ORDER_FLOWERS` (№ 1042, new, courier, `goods.card`, window 10–12 завтра, recipient Мадина), `ORDER_ELECTRONICS` (§3.3 контракта), `ORDER_PHONE_READY` (pickup, ready, on_receipt), `ITEM_LAPTOP`, `ITEM_PHONE_LOW`, `ITEM_HIDDEN`, `ITEM_NO_STOCK`, `CLIENT_MADINA`, `CLIENT_REGULAR`, `TODAY` (shop «Цветы «Лилия»», subscription до 24.10, orders 3/5, storefront7d 412/31, month 86 400, ads 420 ₽ · 1 дн.). `NOW = new Date("2026-10-18T09:30:00+03:00")`.
- [ ] **Step 2: Тесты** (по одному файлу на модуль): `actionsFor` — new → [assembling «Принять» needs none? — для flowers needs "readyBy"] (решение: `needs: "readyBy"` когда `o.goods.vertical === "flowers" && status new`; иначе none); assembling+courier → [ready «Готов», shipping «Курьеру» needs courier]; ready+pickup → [delivered «Выдан и оплачен» needs deliver]; ready+pickup+paid → label «Выдан»; shipping → [delivered «Доставлен»]; delivered → []; `next` пустой → []. `statusPill`: new → «новый · 4 минуты назад» dng. `whenLabel` сегодня/завтра/дата. `handoverLabel` окно. `matchOrder` по номеру «1042», имени, телефону «111», названию. `whatsappUrl("+7 940 111-22-33", "Привет")` → `https://wa.me/79401112233?text=%D0%9F…`. `stockPill` все режимы. `clientViews("flowers")` без warranty. `parseClientDates("19.10 день рождения мамы\n08.03 8 марта\n01.12 апгрейд: предложить ноут")` → 3 даты, третья `upgrade_offered`; «32.13 мусор» → ошибка с номером строки. `subscriptionLine` 6 дней / истекла / null. `parseItemsParam("7701:1,7702:2,7701:3,x:1")` → `[{7701,4? нет — схлопывание: последний побеждает → 3},{7702,2}]`; решение: суммируем? — **последняя запись побеждает**. `parseOrderForm`: без позиций → «Выберите хотя бы один товар»; курьер без адреса → «Укажите адрес доставки»; окно без даты → «Окно доставки — только вместе с датой»; телефон кривой → «Телефон не разобран — укажите в формате +7…»; полный — input с `deliveryDate`, `window`, `payment`, `accept: true`.
- [ ] **Step 3: Реализация** модулей; форматы времени — через `localDay`, `localHHMM` из `lib/sto/slots`, `dayShort`, `relativeAt`, `count`, `rub` из `lib/format`.
- [ ] **Step 4: Прогнать** `pnpm vitest run src/lib/goods`.
- [ ] **Step 5: Commit** `feat(магазин): чистые правила экранов — статусы, пилюли, виды, разбор форм`

---

### Task 5: Серверные действия

**Files:**
- Create: `src/app/(app)/goods-actions.ts`, `src/app/(app)/goods-actions.test.ts`, `src/app/(app)/shop-actions.ts`

**Interfaces:**
- `transitionOrderAction(fd)`: поля `orderId, status, return, readyBy? (HH:MM сегодня или ISO), courierId?, paid? ("1"), cancelReason?, serial_<id>…`; при удаче `back(ret, { do: null, ok: <подпись>, msg: clientMessage ?? undefined })`.
- `extendReserveAction(fd)`: `orderId, days`; `saveOrderNoteAction(fd)`: `orderId, note`.
- `createOrderAction(fd)`: `parseOrderForm` → `createGoodsOrder` → `redirect(\`/zakazy/${order.id}?ok=…\`)`; отказ → `/zakazy/novyi?step=1&i=…&err=…&<echo>`.
- `saveItemAction(fd)`: `listingId, price, price0, mode, mode0, qty, qty0, low, low0, return` — шлёт `items/price` только если цена изменилась, `items/stock` — если изменился режим/остаток/порог (или остатка не было и ввели qty/режим).
- `saveGoodsClientNoteAction(fd)`: `phone, name, note, dates` (разбор `parseClientDates`).
- `saveVerticalAction(fd)`: `vertical` (хозяин, раздел `goodsSettings`).
- `switchShopAction(fd)` (`shop-actions.ts`): `shopId` ∈ `myServiceShops()` → `saveShopChoice` → `redirect(homePath(kind, role))`; чужая → `redirect("/")`.
- Общее: `ctx(section)` — `serviceContext()`; нет — `/`; `shop.kind !== "goods"` → `HOME_PATH[role]`; `!can(role, section)` → `back(ret, { err: "Это может админ или хозяин магазина" })`. `revalidateGoods(orderId?)`: `/magazin`, `/zakazy`, `/pokupateli`, `/tovary`, и `/zakazy/<id>`.
- Подписи итогов: assembling «Заказ принят», ready «Заказ готов», shipping «Передан курьеру», delivered «Заказ закрыт», cancelled «Заказ отменён»; хвост « — клиент получил уведомление сайта» если `order.buyer.hasAccount`, иначе « — напишите клиенту в WhatsApp» если `clientMessage`.

- [ ] **Step 1: Тесты** (моки `@/lib/context`, `@/lib/api/goods`, `next/navigation`, `next/cache`):
  - переход: `transitionGoodsOrder` зовётся с `{ shopId: 9, actorUserId: "u1", orderId: 1042, status: "assembling", readyBy: <ISO сегодняшних 10:00> }`, редирект на `/zakazy/1042?ok=…&msg=…`;
  - переход «выдан»: `serial_7701=SN1`, `paid=1` → `serials: [{listingId:7701, serial:"SN1"}], paid: true`;
  - отказ сайта → `?err=<message>`, `do` сохранён (шторка остаётся открытой);
  - мастер → редирект `?err=Это может админ или хозяин магазина`;
  - сервисная витрина → редирект `HOME_PATH[role]`;
  - создание: валидная форма → `/zakazy/318?ok=Заказ № 318 заведён`; без позиций → `/zakazy/novyi?step=1&err=…`;
  - товар: цена не менялась → `saveGoodsPrice` не зовётся; `qty0=2, qty=5` → `saveGoodsStock({ listingId, qty: 5 })`;
  - заметка клиента с кривой датой → `?note=<phone>&err=…`.
- [ ] **Step 2: Реализация** по образцу `zametki-actions.ts`/`staff-actions.ts` (`back`, `returnTo`, `str`).
- [ ] **Step 3: Прогнать** `pnpm vitest run "src/app/(app)/goods-actions"`.
- [ ] **Step 4: Commit** `feat(магазин): серверные действия заказов, товаров, клиентов и вертикали`

---

### Task 6: Экран «Сегодня» + общие стили магазина

**Files:**
- Create: `src/app/(app)/magazin/page.tsx`, `src/components/Pill.tsx`, `src/components/Thumb.tsx`
- Modify: `src/app/globals.css`, `src/lib/site.ts` (+ `subscriptionUrl(shopId)`, `adsUrl()`, `listingUrl(slug)`)

**Структура экрана** (телефон, `.page stack`; веб — `.page-narrow`, `.head`):
1. `ScreenHead title={today.shop.name} sub={storefrontLine}`; `.head` с `head-t` = имя, `head-s` = «{регион} · {витрина} · подписка {subscriptionLine}».
2. `Flash`.
3. Карточка подписки `.card.sub-card` (`card-warm` при `daysLeft ≤ 7`, `card-danger` при `expired`): «Подписка {subscriptionLine}» + `<a class="aui-btn aui-btn--primary aui-btn--sm" href={subscriptionUrl(shop.id)}>Оплатить</a>`; `hint`: «Счёт и ссылку на оплату выставляет менеджер площадки — кнопка ведёт в кабинет магазина на сайте.»
4. `.kpis` 2×2: «Новых заказов» `{orders.new}` / `{slaLabel(slaNewHours)}` (если `overdueNew > 0` — «{n} ждут дольше {N} ч» и тон dng, ссылка на `/zakazy?v=new`); «На сегодня» `{orders.today}` / «{todayCourier} доставки · {todayPickup} самовывоз» (ссылка `/zakazy?v=work`); «Витрина · 7 дн.» `{views}` / «просмотров · {phoneReveals} тел.»; «Выручка · {monthLabel}» `{rub(revenue)}` / «по закрытым заказам · {closed}».
5. `.card` «Ближайшие»: `upcoming.map` → `Link /zakazy/<id>` `.row.up-row`: `<span class="mono up-t">{upcomingTime}</span>` `{orderTitle} · {rub(total)}` / `{handoverLabel} · {buyer.name}` + `Pill statusPill`. Пусто — «Активных заказов нет — новые появятся здесь, как только придут с витрины или вы заведёте заказ по звонку.»
6. Реклама: `ads` есть → `.card`: «Реклама «{title}»» / `adsLine` + `<a href={adsUrl()}>Пополнить</a>`; нет — не рисуем.
7. Отказ сайта (`!res.ok`): `Flash err` с заголовком «Сводка не загрузилась» и текстом `res.error`; `not_found` → карточка «Раздел магазина на сайте выключен» (флаг `goods_crm`) — честно: «Включает поддержка площадки; экраны появятся, как только сайт ответит.»

**Стили (globals.css, оба режима):**
```css
/* Магазин товаров: пилюли статусов — только существующие токены */
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 0 8px; border-radius: var(--radius-pill); font-size: 11.5px; font-weight: 600; background: var(--bg-2); color: var(--ink-2); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.pill-dng { background: var(--danger-bg); color: var(--accent); border: 1px solid var(--danger-line); }
.pill-ok { background: var(--ok-bg); color: var(--green-dark); }
.pill-warn { background: var(--warm); color: var(--tag-urgent); }
.pill-ink { background: var(--ink); color: #fff; }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kpi { display: block; background: #fff; border-radius: 16px; border: .75px solid var(--m-hair); box-shadow: var(--shadow-m-card); padding: 12px 14px; min-width: 0; }
.kpi-l { font-size: 11.5px; color: var(--muted); } .kpi-v { font-family: var(--font-mono); font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin-top: 2px; font-variant-numeric: tabular-nums; } .kpi-s { font-size: 11.5px; color: var(--muted); margin-top: 2px; } .kpi.is-dng .kpi-v { color: var(--accent); }
.thumb { flex: none; width: 56px; height: 56px; border-radius: 12px; background: var(--bg-2); color: var(--muted-2); display: inline-flex; align-items: center; justify-content: center; overflow: hidden; } .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gcard { display: flex; flex-direction: column; gap: 10px; } .gcard-top { display: flex; gap: 12px; align-items: flex-start; } .gcard-t { font-size: 15px; font-weight: 700; letter-spacing: -.01em; } .gcard-s { font-size: 12.5px; color: var(--muted); } .gcard-who { font-family: var(--font-mono); font-size: 12.5px; }
.gcard-actions { display: flex; gap: 8px; flex-wrap: wrap; } .gcard-actions > *, .gcard-actions form { flex: 1; min-width: 0; } .gcard-actions form { display: contents; } .gcard-actions .aui-btn { width: 100%; min-height: 40px; }
.up-row .up-t { flex: none; width: 48px; font-size: 12.5px; color: var(--muted); }
.price { font-family: var(--font-mono); font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
@media (min-width: 881px) { .ggrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; } .kpis { grid-template-columns: repeat(4, 1fr); } }
```
`Pill({ spec })` → `<span className={\`pill pill-${tone}\`}>{text}</span>` (тон `neu` — без модификатора). `Thumb({ src, alt })` — `<img>` с eslint-disable как в `PhotoUpload.tsx` (адреса хранилища сайта), пусто — `Icon box`.

- [ ] **Step 1:** компоненты и стили. **Step 2:** экран. **Step 3:** `tsc`, `lint`. **Step 4:** Commit `feat(магазин): экран «Сегодня» — подписка, четыре числа, ближайшие заказы, реклама`

---

### Task 7: Экран «Заказы»

**Files:** Create `src/app/(app)/zakazy/page.tsx`.

- Параметры: `v` ∈ `ORDER_VIEWS` (по умолчанию `new`), `q`. Данные: `fetchGoodsOrders({ view })`; поиск — по загруженному виду (`matchOrder`), список ≤ 200.
- Шапка: `ScreenHead title="Заказы" sub={\`сегодня ${counts.today}\`}`; `.head-tail` — `Link aui-btn--primary href="/zakazy/novyi"` «Новый заказ».
- Чипы (`.chips`, `Link.chip aria-current`): `{ORDER_VIEW_LABEL[v]} {counts[v]}` (у `closed` без числа, как на артборде — нет, число есть в counts: рисуем).
- Поиск: `form.search method=get action=/zakazy` с `name=q`, скрытый `v`.
- Карточка `.card.card-sm.gcard` (ключ id): `.gcard-top`: `Thumb items[0].img`, `.row-main`: `.gcard-t {orderTitle}` / `.gcard-s {itemsLine}` / `.gcard-who {buyer.name} · {formatPhone}`; `.pills`: `statusPill` + `orderPills`; `.gcard-actions`: `<a href=tel:>Позвонить</a>` (если телефон), `<a href={whatsappUrl}>WhatsApp</a>`, главное действие: `needs === "none"` → `<form action={transitionOrderAction}>` с hidden `orderId, status, return=/zakazy?v=…` и `button aui-btn--primary`; иначе `Link aui-btn--primary href=/zakazy/<id>?do=<needs>`; второе действие (если есть) — `aui-btn--outline` так же; «Отказ» — только на карточке заказа. Вся карточка не ссылка (внутри формы), заголовок — `Link` на `/zakazy/<id>`.
- Пусто: по виду — «Новых заказов нет» / «В работе ничего нет» / …; отказ сайта — `Flash err` «Заказы не загрузились».
- Веб: список в `.ggrid`.
- [ ] Commit `feat(магазин): экран «Заказы» — виды, поиск, одно главное действие на карточке`

---

### Task 8: Экран «Заказ»

**Files:** Create `src/app/(app)/zakazy/[id]/page.tsx`.

- `fetchGoodsOrder({ orderId })`; `not_found` → `notFound()`; иной отказ — `Flash err` + ссылка назад.
- Шапка: `title="Заказ № {number}"`, `sub="{sourceLabel} · {dayShort(createdAt)} · {localHHMM}"`, `back=/zakazy?v=<вид по статусу>`.
- `Flash ok/err`; **карточка WhatsApp** при `?msg=`: `.card-warm` «Сообщение клиенту» + текст + `<a class="aui-btn aui-btn--primary" href={whatsappUrl(buyer.phone, msg)}>Открыть WhatsApp</a>`; подпись: `hasAccount ? "Клиент с учёткой уже получил уведомление сайта — WhatsApp по желанию." : "У клиента нет учётки на сайте: сайт ему не пишет, сообщение уходит из вашего WhatsApp."`
- Карточка «Что собрать» / «Товар»: позиции (`Thumb`, title, `{qty} × {price} = …`), `composition` (цветы), `card` → pill «открытка: «…»», `comment` покупателя; электроника: pills «гарантия N мес», «S/N {serial}» или «S/N при выдаче».
- Карточка «Получатель» (flowers с `goods.recipient`) / «Покупатель»: имя, «заказывает {n}-й раз» / «первый заказ» (`clientOrdersCount`), «с сайта» если `hasAccount`; кнопки tel / WhatsApp; телефон моно. Получатель цветов — второй блок с его телефоном.
- Карточка «Доставка» / «Получение»: `seg` только для чтения (две ссылки-пилюли с `aria-current`), `Дата · Окно` (`goods.deliveryDate`, `goods.window` или `slot`), адрес, «Доставка {rub(delivery)}» / самовывоз: `pickup.address · pickup.hours`; `dueAt` — `whenLabel`. Электроника: «Резерв до {dd.mm · hh:mm}» + pill dng «резерв истёк» если `reserveExpired`; `Link aui-btn--outline href=?do=reserve` «Продлить резерв». Курьер (`courier`) — имя и телефон.
- Карточка «Итого»: `rub(total)` (`subtotal + delivery`), способ оплаты (`PAYMENT_LABEL`), `paidAt` → pill ok «оплачен {dd.mm hh:mm}».
- Заметка владельца: `Link.card-warm.note-card href=?do=note` («Заметка к заказу»).
- История: «создан {relativeAt(createdAt)} · статус изменён {relativeAt(updatedAt)}» в `hint`.
- Действия `.sticky-actions`: «Отказ» (`Link aui-btn--danger href=?do=cancel`, если `next` содержит `cancelled`) + главное (`actionsFor[0]`): `needs none` → форма; `readyBy` → `Link ?do=accept`; `courier` → `?do=courier`; `deliver` → `?do=deliver`. Второе действие — `aui-btn--outline`.
- Шторки (`Sheet`, форма с `form=`), все с hidden `orderId`, `return=/zakazy/<id>`:
  - `accept`: «Принять заказ» — `input type=time name=readyBy` («собрать к», по умолчанию +1 ч от сейчас, минимум сейчас) + `hidden status=assembling`; подпись «Клиент получит сообщение с временем».
  - `courier`: «Передать курьеру» — `ownDelivery` → радио-чипы `courierId` из `shop.couriers` (`.chips` с `<label class="chip"><input type=radio …>`), пусто → карточка «Своих курьеров нет — добавьте их в кабинете магазина на сайте» со ссылкой; `!ownDelivery` → подпись «Везёт курьер площадки»; `hidden status=shipping`.
  - `deliver`: «Выдать заказ» — электроника: `input name=serial_<listingId>` на каждую позицию (maxLength 40, «S/N — попадёт в гарантийный талон клиента»); чекбокс `paid` (checked, если `!paidAt`) «Оплата получена»; `hidden status=delivered`; кнопка «Выдан и оплачен» / «Выдан». Для курьерского — «Доставлен».
  - `reserve`: чипы дней `1 · 2 · 3 · 7` (радио) → `extendReserveAction`.
  - `note`: textarea `note` (500) → `saveOrderNoteAction`.
  - `cancel`: textarea `cancelReason` (300) + `hidden status=cancelled`, кнопка danger «Отменить заказ».
- [ ] Commit `feat(магазин): карточка заказа — цветы и электроника, шторки переходов, WhatsApp`

---

### Task 9: Экран «Новый заказ по звонку»

**Files:** Create `src/app/(app)/zakazy/novyi/page.tsx`.

- Параметры: `step` (0 товары · 1 оформление), `i` (позиции `7701:1,…`), `q` (поиск товаров), `n`, `ph` (предзаполнение из «Клиентов» и из отказа), эхо формы (`order-form.formEcho`).
- Данные: `Promise.all([fetchGoodsItems({ view: "all" }), fetchGoodsSettings()])` → вертикаль (отказ → `general`).
- Шаг 0 «Товары» (`steps=[2,0]` в `sect`): поиск `?q=` (form get, hidden `i`, `n`, `ph`); список `.card.card-flat` строк: `Thumb`, title, `price`, `stockPill`; справа степпер ссылками: `Link href=…withQty(-1)` «−», число, `Link withQty(+1)` «+» (у `stock.mode = count` не больше `available`; `visibility !== "visible"` — строка с подписью «скрыт с витрины», но заказать можно, остаток проверит сайт). Подвал `.sticky-actions`: «{N} поз. · {sum} ₽» и `Link aui-btn--primary href=?step=1&i=…` «Дальше» (disabled-вид при пустом). Пусто — карточка «Товаров нет» со ссылкой «Добавить товар на сайте».
- Шаг 1 «Оформление»: `form action={createOrderAction}` с hidden `shopId`, `items`; поля: Клиент — `name` (required, maxLength 60), `phone` (tel, required); Получение — `seg` радио `method` (courier/pickup; электроника по умолчанию pickup, цветы — courier); `address` (200); `deliveryDate` (date), `windowFrom`/`windowTo` (time) — для курьера; `pickupAt` (datetime-local) — самовывоз; `deliveryPrice` (number, 0); Цветы: `recipientName`, `recipientPhone`, `card` (300), `composition` (500); Электроника: `reserveDays` чипы-радио 1·2·3·7 (по умолчанию 2, при самовывозе); Оплата — радио `payment` on_receipt/transfer/link (по умолчанию on_receipt); `note` (500); чекбокс `accept` «Сразу принять в работу» (checked). Сверху — сводка позиций с суммой и ссылка «Изменить» на шаг 0. Подвал: «Назад» + «Завести заказ».
- [ ] Commit `feat(магазин): заказ по звонку — выбор товаров и оформление в два шага`

---

### Task 10: Экран «Товары»

**Files:** Create `src/app/(app)/tovary/page.tsx`.

- Параметры `v` ∈ `ITEM_VIEWS`, `cat` (слаг), `q`, `edit`, `mode`, `qty`, `low`, `price`. Данные `fetchGoodsItems({ view, category })`.
- Шапка: `sub = "{counts.all − counts.hidden} на витрине · {counts.hidden} скрыто"`; `.head-tail`: `<a aui-btn--outline href={shopStorefrontUrl(shop.id)}>Добавить товар на сайте →</a>`.
- Чипы: «Все {all}» · по `categories` («{label} {count}», `?cat=`) · «Кончаются {low}» (`?v=low`) · «Скрыто {hidden}» (`?v=hidden`).
- Поиск `?q=` по `matchItem`.
- Карточка `.card.card-sm.gcard`: `Thumb`, `.gcard-t` title, `.gcard-s` description, `.pills`: `stockPill`, `reservePill`; `.split`: `.price {formatRub(price)}` + `visibilityLine`; `Link.icon-btn href=?edit=<id>` (карандаш) + `<a href={listingUrl(slug)}>карточка на сайте</a>`.
- Шторка `?edit=`: заголовок title, sub «цена и остаток»; форма `saveItemAction`: hidden `shopId, listingId, return, price0, mode0, qty0, low0`; «Цена, ₽» — `.money` с ссылками ±100 (как на «Услугах»); «Остаток» — чипы режима (`Link ?edit=&mode=count|today|on_order`, `aria-pressed`), при `count`: `.money` ± для `qty`, поле `low` «Порог «кончаются»»; подпись: «Остаток 0 снимает товар с витрины сам, больше нуля — возвращает. Снятое владельцем или модерацией остатком не вернуть.» Кнопка «Сохранить».
- Пусто/отказ — как на других экранах.
- [ ] Commit `feat(магазин): экран «Товары» — остаток, резерв, цена, видимость`

---

### Task 11: Экран «Клиенты»

**Files:** Create `src/app/(app)/pokupateli/page.tsx`.

- Параметры `v` ∈ `clientViews(vertical)`, `q`, `note` (телефон для шторки). Данные `Promise.all([fetchGoodsClients({ view }), fetchGoodsSettings()])`.
- Шапка `title="Клиенты" sub={count(counts.all, "клиент", "клиента", "клиентов")}`; чипы по `clientViews(vertical)` с `counts`; поиск по `matchGoodsClient`.
- Карточка `.card.card-sm.gcard`: `.person`: `ava initials(name)`, `.person-n` name, `.person-s` `clientLine`; `.pills`: `clientPills`; заметка `.gcard-s` (если есть); `.gcard-actions`: `<a href={whatsappUrl(phone)}>Написать</a>`, `<a href=tel:>Позвонить</a>`, `Link aui-btn--primary href=/zakazy/novyi?n=&ph=` «Новый заказ»; `Link.icon-btn ?note=<phone>` (карандаш) → шторка.
- Шторка «Заметка о клиенте» (`saveGoodsClientNoteAction`): hidden `shopId, phone, return`; `name` (80), `note` (textarea 1000), `dates` (textarea: «19.10 день рождения мамы», одна дата в строке; для электроники подпись «01.12 апгрейд: предложить ноут»), `formatClientDates` в defaultValue; подпись «Год не хранится — дата повторяется каждый год. Пустые поля стирают заметку, клиент остаётся: он из заказов.»
- Веб: `.ggrid`.
- [ ] Commit `feat(магазин): экран «Клиенты» — сегменты, заметка и даты, WhatsApp и заказ по звонку`

---

### Task 12: «Ещё» магазина и переключатель витрины

**Files:** Create `src/app/(app)/menu/GoodsMenu.tsx`; Modify `src/app/(app)/menu/page.tsx`, `src/components/TopBar.tsx`, `src/app/globals.css`.

- `GoodsMenu({ ctx, sp, shops })`: `Promise.all([fetchGoodsToday(), fetchGoodsSettings(), getServerUser()])` (today — ради витрины и подписки; отказ — строки без цифр). Строки (`Row` как в меню сервиса): «Витрина на сайте» (`storefrontUrl` или кабинет; sub «abkhaz-auto.ru · {storefrontLine}»), «Подписка» (sub `subscriptionLine`, href `subscriptionUrl`), хозяину «Вертикаль магазина» (sub «цветы / электроника / товары — набор полей заказа», `Link ?do=vertical`). Карточка «Ваши витрины» при `shops.length > 1`: формы `switchShopAction` с кнопками-строками (`aria-current` у текущей, sub «магазин»/«автосервис»). Карточка выхода и шторка `vyhod` — те же, что в сервисе (вынести разметку выхода в `menu/Exit.tsx`, чтобы не дублировать). Шторка `vertical`: радио-чипы `flowers` «Цветы» · `electronics` «Электроника» · `general` «Другие товары» → `saveVerticalAction`.
- `TopBar`: переключатель (см. Task 2) подключить к `switchShopAction`. CSS: `.shop-menu summary { list-style: none; cursor: pointer; } .shop-menu summary::-webkit-details-marker { display: none; } .shop-menu { position: relative; overflow: visible; } .shop-menu-list { position: absolute; top: 44px; left: 0; min-width: 260px; background: #fff; border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-pop); padding: 6px; z-index: 6; } .shop-menu-list button { display: flex; flex-direction: column; width: 100%; text-align: left; padding: 8px 10px; border-radius: var(--radius); } .shop-menu-list button:hover { background: var(--bg-2); } .shop-menu-list button[aria-current="true"] { color: var(--accent); } .shop-menu-list small { font-size: 11.5px; color: var(--muted); }`
- `src/app/(app)/page.tsx` — без правок. `/vhod` текст — упомянуть магазин.
- [ ] Commit `feat(магазин): «Ещё» — витрина, подписка, вертикаль; переключение витрин у владельца`

---

### Task 13: Документация

**Files:** Modify `docs/API-sushchnosti.md`, `README.md`.

- В `API-sushchnosti.md` — раздел «Магазин товаров — `/api/sto/goods/*`» (зеркало контракта: общее, типы §1 целиком, таблицы маршрутов §2–§5, коды §6, §7 «что приложению нужно знать», §8 «чего нет»), с пометкой, что первоисточник — `abkhaz-auto/docs/sto-api-goods-2026-10-18.md`, и правилом: расходятся — правит тот, кто меняет, в обоих репозиториях одним PR-парой.
- README: таблица экранов += `/magazin`, `/zakazy`, `/zakazy/novyi`, `/zakazy/[id]`, `/tovary`, `/pokupateli`; абзац «Магазин товаров»: та же учётка, витрина `rubric = goods`, вкладки, флаг `goods_crm` на сайте, вертикаль.
- [ ] Commit `docs: зеркало контракта /api/sto/goods/* и экраны магазина в README`

---

### Task 14: Проверки и живой прогон

- [ ] `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` — все четыре зелёные; вывод сохранить для PR.
- [ ] Живой прогон (не блокирующий): поднять приложение локально с `SITE_INTERNAL_URL` на заглушку `/api/sto/goods/*` из фикстур (скрипт в scratchpad, Node `http`), сессия — по рецепту памяти `abkhaz-sto-test-stand` (локальная Supabase сайта + `mobile-bridge`) или, если локальной базы нет, — рендер страниц через `next build` + проверка маршрутов в `.next` и ручной просмотр с временной подменой `serviceContext`… — если ни то, ни другое не укладывается в разумное время, честно записать в PR «вживую не проверено, опирался на контракт и тесты».
- [ ] Сверить контракт с `origin/feat/goods-crm-items-clients` ещё раз (`git fetch`, diff файла с моментом начала).

### Task 15: PR

- [ ] `git push -u origin claude/goods-crm-7076ca`; `gh pr create -R Zebrooo/abkhaz-sto --base main` — заголовок «feat(магазин): СРМ владельца магазина товаров — Сегодня · Заказы · Товары · Клиенты», тело: что сделано по экранам, ссылка на контракт (ветка `feat/goods-crm-items-clients` сайта, PR сайта — когда появится), что требуется на сайте (флаг `goods_crm`, витрина `rubric = goods`, `status = approved`), что не проверено вживую, чек-лист проверок; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Дождаться `checks`, разобрать ревью, смержить самому; деплой — владелец.

---

## Самопроверка плана

- Покрытие: п.1 (контекст) — Task 1; п.2 (навигация, тест) — Task 2; п.3 (API, 15 маршрутов) — Task 3; п.4 экраны — Tasks 6–12 (Сегодня 6, Заказы 7, Заказ 8 с резервом/серийником/«Выдан и оплачен», Товары 10 с правкой остатка и цены и ссылкой на редактор, Клиенты 11 с «Написать» и «Новый заказ» → 9); п.5 зеркало — Task 13; п.6 тесты — в каждой задаче, действия с моками — Task 5.
- Сигнатуры: `activeTab(kind, role, path)`, `sideNav(kind, role)`, `tabsFor(kind, role)`, `visibleKeys(kind, role)` — везде одинаково; `requireGoods(section = "goods")`; действия принимают `return`, hidden `shopId` не нужен (контекст берёт текущую витрину из куки, как `zametki-actions.ts`), поэтому в формах `shopId` НЕ кладём — убрать упоминания hidden `shopId` из Tasks 9–11 при реализации (`serviceContext()` — источник истины).
- Плейсхолдеров нет: там, где план даёт структуру экрана словами, все подписи и поля перечислены.
