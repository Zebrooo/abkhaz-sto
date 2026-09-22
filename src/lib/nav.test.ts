import { describe, expect, it } from "vitest";
import { can, HOME_PATH, STO_ROLES } from "@/lib/access";
import { activeTab, MENU, NAV_SECTION, navKeyOf, ROUTE, sideNav, TABS, visibleKeys } from "@/lib/nav";

describe("навигация по ролям", () => {
  // Ловушка: вкладка ведёт в раздел, где requireSection тут же уводит обратно.
  it("ни одна роль не видит пункт в закрытый ей раздел", () => {
    for (const r of STO_ROLES) {
      for (const k of visibleKeys(r)) {
        expect(can(r, NAV_SECTION[k]), `${r} видит пункт ${k}`).toBe(true);
      }
    }
  });

  it("первый экран роли подсвечивает её вкладку, а не «Ещё»", () => {
    expect(activeTab("master", HOME_PATH.master)).toBe("mywork");
    expect(activeTab("admin", HOME_PATH.admin)).toBe("smena");
    expect(activeTab("owner", HOME_PATH.owner)).toBe("dash");
  });

  it("красная кнопка новой записи — только у админа", () => {
    expect(TABS.admin.some(t => t.key === "fab")).toBe(true);
    expect(TABS.master.some(t => t.key === "fab")).toBe(false);
    expect(TABS.owner.some(t => t.key === "fab")).toBe(false);
  });

  // Осмотр внутри записи: у мастера это вкладка «Осмотр», у админа —
  // часть «Записей», а не «Ещё».
  it("осмотр записи поднимается к своей вкладке", () => {
    expect(navKeyOf("/zapis/812/osmotr")).toBe("inspect");
    expect(navKeyOf("/zapis/812/otchet")).toBe("inspect");
    expect(navKeyOf("/zapis/812")).toBe("today");
    expect(activeTab("master", "/zapis/812/osmotr")).toBe("inspect");
    expect(activeTab("admin", "/zapis/812/osmotr")).toBe("today");
    expect(activeTab("master", "/zapis/812")).toBe("mywork");
    // «Осмотр без записи» — тоже вкладка «Осмотр»: с неё туда и приходят.
    expect(navKeyOf("/osmotr/novyi")).toBe("inspect");
    expect(activeTab("master", "/osmotr/novyi")).toBe("inspect");
  });

  // Ловушка, из-за которой хозяин не находил готовых отчётов: у пункта не
  // было своего адреса, и он вёл туда же, куда «Осмотр», — на записи дня.
  it("готовые отчёты — свой адрес, и он у всех ролей", () => {
    expect(ROUTE.report).toBe("/otchety");
    expect(navKeyOf("/otchety")).toBe("report");
    for (const r of STO_ROLES) expect(visibleKeys(r), r).toContain("report");
  });

  it("с любого адреса у любой роли подсвечена вкладка, которая у неё есть", () => {
    const paths = ["/", "/segodnya", "/kalendar?d=1", "/klienty/u1", "/svodka", "/mastera", "/chat/5",
      "/uslugi", "/raspisanie", "/uvedomleniya", "/dostupy", "/menu", "/moi-raboty", "/otchety", "/chto-to"];
    for (const r of STO_ROLES) {
      const keys = TABS[r].map(t => t.key);
      for (const p of paths) expect(keys, `${r} на ${p}`).toContain(activeTab(r, p));
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
    expect(sideNav("owner").map(s => s.key)).toContain("access");
    expect(MENU.admin).not.toContain("access");
    expect(sideNav("admin").map(s => s.key)).not.toContain("access");
  });
});
