import { describe, expect, it } from "vitest";
import { can, GOODS_HOME, HOME_PATH, HOME_SECTION, homePath, isStoRole, STO_ROLES, STO_ROLE_LABEL, type Section } from "@/lib/access";

describe("роли сервиса", () => {
  it("мастер не видит денег, доступов и настроек", () => {
    for (const s of ["money", "access", "schedule", "editServices"] as Section[]) {
      expect(can("master", s), `мастеру открылся раздел ${s}`).toBe(false);
    }
  });

  it("мастер не отправляет отчёт клиенту — только передаёт админу", () => {
    expect(can("master", "inspect")).toBe(true);
    expect(can("master", "sendReport")).toBe(false);
    expect(can("admin", "sendReport")).toBe(true);
  });

  it("админу не видны деньги и доступы", () => {
    expect(can("admin", "money")).toBe(false);
    expect(can("admin", "access")).toBe(false);
  });

  // Хозяин — последняя инстанция: раздел, закрытый и от него, не откроет никто,
  // и сервис останется с экраном, до которого нельзя дойти.
  it("хозяину открыто всё, что открыто кому-нибудь", () => {
    const sections = new Set<Section>();
    for (const r of STO_ROLES) {
      for (const s of ["shift", "bookings", "clients", "inspect", "sendReport", "chat",
        "services", "editServices", "schedule", "masters", "money", "access"] as Section[]) {
        if (can(r, s)) sections.add(s);
      }
    }
    for (const s of sections) expect(can("owner", s), `хозяину закрыт раздел ${s}`).toBe(true);
  });

  // Ловушка: роль входит и попадает на экран, который ей же и запрещён.
  it("первый экран роли ей доступен", () => {
    for (const r of STO_ROLES) {
      expect(can(r, HOME_SECTION[r]), `${r} входит в закрытый ему раздел`).toBe(true);
      expect(HOME_PATH[r].startsWith("/")).toBe(true);
    }
  });

  it("у каждой роли есть подпись и распознавание", () => {
    for (const r of STO_ROLES) {
      expect(STO_ROLE_LABEL[r]).toBeTruthy();
      expect(isStoRole(r)).toBe(true);
    }
    expect(isStoRole("director")).toBe(false);
    expect(isStoRole(null)).toBe(false);
  });
});

describe("магазин товаров", () => {
  // Сайт пускает в /api/sto/goods/* админа и хозяина, мастера — нет
  // (контракт §0); интерфейс обязан рисовать ровно это.
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
    expect(homePath("service", "master")).toBe(HOME_PATH.master);
  });
});
