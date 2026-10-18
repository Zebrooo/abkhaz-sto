import { describe, expect, it } from "vitest";
import { can, GOODS_HOME, HOME_PATH, STO_ROLES } from "@/lib/access";
import { activeTab, goodsMenu, MENU, NAV_SECTION, navKeyOf, ROUTE, sideNav, TABS, tabsFor, visibleKeys } from "@/lib/nav";

describe("навигация по ролям", () => {
  // Ловушка: вкладка ведёт в раздел, где requireSection тут же уводит обратно.
  it("ни одна роль не видит пункт в закрытый ей раздел", () => {
    for (const r of STO_ROLES) {
      for (const k of visibleKeys("service", r)) {
        expect(can(r, NAV_SECTION[k]), `${r} видит пункт ${k}`).toBe(true);
      }
    }
  });

  it("первый экран роли подсвечивает её вкладку, а не «Ещё»", () => {
    expect(activeTab("service", "master", HOME_PATH.master)).toBe("mywork");
    expect(activeTab("service", "admin", HOME_PATH.admin)).toBe("smena");
    expect(activeTab("service", "owner", HOME_PATH.owner)).toBe("dash");
  });

  it("красная кнопка новой записи — у админа и хозяина, посередине; у мастера нет", () => {
    for (const r of ["admin", "owner"] as const) {
      expect(TABS[r].findIndex(t => t.key === "fab"), r).toBe(Math.floor(TABS[r].length / 2));
    }
    expect(TABS.master.some(t => t.key === "fab")).toBe(false);
  });

  // Осмотр внутри записи: у мастера это вкладка «Осмотр», у админа —
  // часть «Записей», а не «Ещё».
  it("осмотр записи поднимается к своей вкладке", () => {
    expect(navKeyOf("/zapis/812/osmotr")).toBe("inspect");
    expect(navKeyOf("/zapis/812/otchet")).toBe("inspect");
    expect(navKeyOf("/zapis/812")).toBe("today");
    expect(activeTab("service", "master", "/zapis/812/osmotr")).toBe("inspect");
    expect(activeTab("service", "admin", "/zapis/812/osmotr")).toBe("today");
    expect(activeTab("service", "master", "/zapis/812")).toBe("mywork");
    // «Осмотр без записи» — тоже вкладка «Осмотр»: с неё туда и приходят.
    expect(navKeyOf("/osmotr/novyi")).toBe("inspect");
    expect(activeTab("service", "master", "/osmotr/novyi")).toBe("inspect");
  });

  // Ловушка, из-за которой хозяин не находил готовых отчётов: у пункта не
  // было своего адреса, и он вёл туда же, куда «Осмотр», — на записи дня.
  it("готовые отчёты — свой адрес, и он у всех ролей", () => {
    expect(ROUTE.report).toBe("/otchety");
    expect(navKeyOf("/otchety")).toBe("report");
    for (const r of STO_ROLES) expect(visibleKeys("service", r), r).toContain("report");
  });

  it("с любого адреса у любой роли подсвечена вкладка, которая у неё есть", () => {
    const paths = ["/", "/segodnya", "/kalendar?d=1", "/klienty/u1", "/svodka", "/mastera", "/chat/5",
      "/uslugi", "/raspisanie", "/uvedomleniya", "/dostupy", "/menu", "/moi-raboty", "/otchety", "/chto-to"];
    for (const r of STO_ROLES) {
      const keys = TABS[r].map(t => t.key);
      for (const p of paths) expect(keys, `${r} на ${p}`).toContain(activeTab("service", r, p));
    }
  });

  it("«Осмотр» — постоянный адрес редиректора, и он подсвечивает свою вкладку", () => {
    // Куда идти дальше (текущая запись, новый осмотр, отчёты), решает
    // страница /osmotr при переходе — вкладке расчёт не нужен.
    expect(ROUTE.inspect).toBe("/osmotr");
    expect(navKeyOf(ROUTE.inspect)).toBe("inspect");
    expect(ROUTE.today).toBe("/segodnya");
  });

  it("«Доступы» есть только у хозяина, и в меню, и слева", () => {
    expect(MENU.owner).toContain("access");
    expect(sideNav("service", "owner").map(s => s.key)).toContain("access");
    expect(MENU.admin).not.toContain("access");
    expect(sideNav("service", "admin").map(s => s.key)).not.toContain("access");
  });
});

describe("вкладки магазина товаров", () => {
  it("дословно по артборду, без «+», одни на обе роли", () => {
    expect(tabsFor("goods", "owner").map(t => t.label)).toEqual(["Сегодня", "Заказы", "Товары", "Клиенты", "Ещё"]);
    expect(tabsFor("goods", "admin")).toEqual(tabsFor("goods", "owner"));
    expect(tabsFor("goods", "owner").some(t => t.key === "fab")).toBe(false);
    // Сервис не меняется: у хозяина по-прежнему «Деньги» первыми.
    expect(tabsFor("service", "owner")).toBe(TABS.owner);
  });

  it("ни один пункт магазина не ведёт в закрытый роли раздел", () => {
    for (const r of ["admin", "owner"] as const) {
      for (const k of visibleKeys("goods", r)) expect(can(r, NAV_SECTION[k]), `${r} видит пункт ${k}`).toBe(true);
    }
  });

  it("первый экран магазина подсвечивает «Сегодня», карточки — свои вкладки", () => {
    expect(activeTab("goods", "owner", GOODS_HOME)).toBe("gtoday");
    expect(activeTab("goods", "owner", "/zakazy/1042")).toBe("orders");
    expect(activeTab("goods", "owner", "/zakazy/novyi?step=1")).toBe("orders");
    expect(activeTab("goods", "admin", "/tovary?v=low")).toBe("items");
    expect(activeTab("goods", "admin", "/pokupateli")).toBe("gclients");
    expect(activeTab("goods", "admin", "/menu")).toBe("more");
    expect(activeTab("goods", "admin", "/chto-to")).toBe("more");
    // Адрес сервиса у магазина не бывает (гейт уводит), но подсветка не ломается.
    expect(activeTab("goods", "owner", "/svodka")).toBe("more");
  });

  it("адреса магазина постоянные и не совпадают с адресами сервиса", () => {
    expect(ROUTE.gtoday).toBe("/magazin");
    expect(ROUTE.orders).toBe("/zakazy");
    expect(ROUTE.items).toBe("/tovary");
    expect(ROUTE.gclients).toBe("/pokupateli");
    expect(navKeyOf("/pokupateli?v=regular")).toBe("gclients");
    const all = Object.values(ROUTE);
    expect(new Set(all).size).toBe(all.length);
  });

  it("левое меню магазина — те же четыре раздела", () => {
    expect(sideNav("goods", "owner").map(s => s.key)).toEqual(["gtoday", "orders", "items", "gclients"]);
    expect(sideNav("goods", "admin")).toEqual(sideNav("goods", "owner"));
  });

  it("«Ещё» магазина: вертикаль — только хозяину", () => {
    expect(goodsMenu("owner")).toContain("vertical");
    expect(goodsMenu("admin")).not.toContain("vertical");
    expect(goodsMenu("admin")).toContain("shop");
  });
});
