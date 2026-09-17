import { describe, expect, it } from "vitest";
import { narrowRole, parseRoleView, serializeRoleView, type RoleView } from "@/lib/role-view";

const who = { shopId: 7, userId: "u-1" };
const view = (role: "admin" | "master"): RoleView => ({ ...who, role });

describe("narrowRole", () => {
  it("хозяин видит то, что примерил", () => {
    expect(narrowRole("owner", view("master"))).toBe("master");
    expect(narrowRole("owner", view("admin"))).toBe("admin");
  });

  it("без примерки — своя роль", () => {
    expect(narrowRole("owner", null)).toBe("owner");
    expect(narrowRole("master", null)).toBe("master");
  });

  it("ПРИМЕРКА ТОЛЬКО СУЖАЕТ: не хозяину она не даёт ничего", () => {
    // Кука мастера с «admin» внутри не должна открыть ему админские экраны:
    // роль в приложении — подсказка, и превращать её в обход прав нельзя.
    expect(narrowRole("master", view("admin"))).toBe("master");
    expect(narrowRole("admin", view("master"))).toBe("admin");
  });
});

describe("parseRoleView", () => {
  it("своя кука читается", () => {
    expect(parseRoleView(serializeRoleView(view("master")), who)).toEqual(view("master"));
  });

  it("чужой сервис, чужая учётка и мусор — как будто примерки нет", () => {
    expect(parseRoleView(serializeRoleView({ ...view("master"), shopId: 8 }), who)).toBe(null);
    expect(parseRoleView(serializeRoleView({ ...view("master"), userId: "u-2" }), who)).toBe(null);
    expect(parseRoleView("7|u-1|owner", who)).toBe(null);
    expect(parseRoleView("мусор", who)).toBe(null);
    expect(parseRoleView("", who)).toBe(null);
    expect(parseRoleView(undefined, who)).toBe(null);
  });

  it("в куке нет ничего, кроме сервиса, учётки и роли", () => {
    expect(serializeRoleView(view("admin"))).toBe("7|u-1|admin");
  });
});
