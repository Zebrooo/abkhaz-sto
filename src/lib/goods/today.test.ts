import { describe, expect, it } from "vitest";
import { adsLine, monthLabel, regionLabel, storefrontLine, subscriptionLine, subscriptionTone, todaySplit } from "@/lib/goods/today";
import { TODAY } from "@/lib/goods/fixtures";
import { rub } from "@/lib/format";

describe("подписи «Сегодня»", () => {
  it("подписка: дни, истекла, сегодня, не задана", () => {
    expect(subscriptionLine(TODAY.subscription)).toBe("до 24.10 · ещё 6 дней");
    expect(subscriptionTone(TODAY.subscription)).toBe("warn");
    expect(subscriptionLine({ until: "2026-10-10", daysLeft: -8, expired: true })).toBe("истекла 10.10");
    expect(subscriptionTone({ until: "2026-10-10", daysLeft: -8, expired: true })).toBe("dng");
    expect(subscriptionLine({ until: "2026-10-18", daysLeft: 0, expired: false })).toBe("до 18.10 · кончается сегодня");
    expect(subscriptionLine({ until: "2026-12-01", daysLeft: 44, expired: false })).toBe("до 01.12 · ещё 44 дня");
    expect(subscriptionTone({ until: "2026-12-01", daysLeft: 44, expired: false })).toBe("ok");
    expect(subscriptionLine({ until: null, daysLeft: null, expired: false })).toBe("срок не задан");
  });

  it("витрина и регион", () => {
    expect(storefrontLine(TODAY.shop)).toBe("Сухум · витрина опубликована");
    expect(storefrontLine({ ...TODAY.shop, regionSlug: null, storefront: "off" })).toBe("витрина не опубликована");
    expect(regionLabel("gagra")).toBe("Гагра");
    expect(regionLabel("nowhere")).toBe("nowhere");
  });

  it("реклама, месяц, разбивка на сегодня", () => {
    expect(adsLine(TODAY.ads!)).toBe(`идёт · остаток ${rub(420)} · хватит на 1 день`);
    expect(adsLine({ ...TODAY.ads!, status: "paused", daysLeft: null })).toBe(`на паузе · остаток ${rub(420)}`);
    expect(monthLabel("2026-10-01")).toBe("октябрь");
    // Сайт отдаёт начало месяца меткой времени: полночь 1 октября по Москве — это ещё 30 сентября по UTC.
    expect(monthLabel("2026-09-30T21:00:00.000Z")).toBe("октябрь");
    expect(todaySplit(TODAY.orders)).toBe("2 доставки · 3 самовывоз");
  });
});
