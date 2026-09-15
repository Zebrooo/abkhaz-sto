import { describe, expect, it } from "vitest";
import { canReschedule, shopTransitionPatch, shopTransitions } from "./transitions";

describe("переходы записи сервисом", () => {
  it("new → confirm | cancel; confirmed → done | no_show | cancel; конечные — ничего", () => {
    expect(shopTransitions("new")).toEqual(["confirm", "cancel"]);
    expect(shopTransitions("confirmed")).toEqual(["done", "no_show", "cancel"]);
    expect(shopTransitions("done")).toEqual([]);
    expect(shopTransitions("cancelled")).toEqual([]);
    expect(shopTransitions("no_show")).toEqual([]);
  });

  it("патч: отмена сервисом пишет cancelled_by = shop, остальные — null; недопустимый — null", () => {
    expect(shopTransitionPatch("new", "cancel")).toEqual({ status: "cancelled", cancelled_by: "shop" });
    expect(shopTransitionPatch("new", "confirm")).toEqual({ status: "confirmed", cancelled_by: null });
    expect(shopTransitionPatch("new", "done")).toBeNull();
    expect(shopTransitionPatch("done", "cancel")).toBeNull();
  });

  it("перенос — только у живой записи", () => {
    expect(canReschedule("new")).toBe(true);
    expect(canReschedule("confirmed")).toBe(true);
    expect(canReschedule("done")).toBe(false);
  });
});
