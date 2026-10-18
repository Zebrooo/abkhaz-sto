import { describe, expect, it } from "vitest";
import { parseShopChoice, serializeShopChoice } from "@/lib/shop-choice";

describe("кука выбранной витрины", () => {
  it("своя кука — номер витрины", () => {
    expect(parseShopChoice(serializeShopChoice(9, "u1"), "u1")).toBe(9);
  });

  // Кука приходит из браузера: чужая учётка или мусор — как будто куки нет.
  it("чужая учётка, мусор и пустота — null", () => {
    expect(parseShopChoice("9|u2", "u1")).toBeNull();
    expect(parseShopChoice("abc|u1", "u1")).toBeNull();
    expect(parseShopChoice("0|u1", "u1")).toBeNull();
    expect(parseShopChoice("", "u1")).toBeNull();
    expect(parseShopChoice(undefined, "u1")).toBeNull();
  });
});
