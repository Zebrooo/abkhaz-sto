import { describe, expect, it } from "vitest";
import { parseAdminShop, serializeAdminShop } from "./admin-shop";

const UID = "0f3b2a10-7c4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("кодек куки админ-контекста", () => {
  it("свой userId — shopId; чужой, мусор и пусто — null", () => {
    const raw = serializeAdminShop(7, UID);
    expect(parseAdminShop(raw, UID)).toBe(7);
    expect(parseAdminShop(raw, "другой")).toBeNull();
    expect(parseAdminShop("abc|" + UID, UID)).toBeNull();
    expect(parseAdminShop("", UID)).toBeNull();
    expect(parseAdminShop(undefined, UID)).toBeNull();
    expect(parseAdminShop(null, UID)).toBeNull();
    expect(parseAdminShop("7.5|" + UID, UID)).toBeNull();
    expect(parseAdminShop("-7|" + UID, UID)).toBeNull();
    expect(parseAdminShop("0|" + UID, UID)).toBeNull();
  });
});
