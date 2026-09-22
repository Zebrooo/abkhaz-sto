import { describe, expect, it } from "vitest";
import { buildFeed, groupFeed } from "@/lib/notifications";
import type { StoBookingRow } from "@/lib/sto/types";
import { localDay, localTime } from "@/lib/sto/slots";
import { timeRange } from "@/lib/format";

function row(o: Partial<StoBookingRow> & { id: number }): StoBookingRow {
  const start = localTime("2026-09-15", "15:00");
  return {
    shop_id: 1, client_id: null, vehicle_id: null, listing_id: null,
    service: { title: "Диагностика двигателя", price: 1200, currency: "RUB", durationMin: 60 },
    starts_at: start.toISOString(), ends_at: localTime("2026-09-15", "16:00").toISOString(),
    post_no: 1, status: "new", cancelled_by: null, source: "site",
    prepay_amount: 0, prepay_status: "none",
    data: { client: { name: "Гурам Броцман", phone: "+79403007712" } },
    created_at: localTime("2026-09-15", "13:56").toISOString(),
    updated_at: localTime("2026-09-15", "13:56").toISOString(),
    ...o,
  };
}

describe("лента уведомлений", () => {
  it("новая запись — с кнопкой подтверждения и подписью времени записи", () => {
    const [n] = buildFeed([row({ id: 814 })], timeRange);
    expect(n.title).toBe("Новая запись с сайта");
    // «без VIN» — у записи, где VIN некому было заполнить (снимок без него):
    // подсказка админу вписать его при приёмке.
    expect(n.text).toBe("Гурам Броцман · Диагностика двигателя · 15:00–16:00, пост 1 · без VIN");
    expect(n.canConfirm).toBe(true);
    expect(n.accent).toBe(true);
  });

  it("ручная запись подписывается иначе", () => {
    const [n] = buildFeed([row({ id: 1, source: "app" })], timeRange);
    expect(n.title).toBe("Новая запись");
  });

  it("у записи с VIN хвоста «без VIN» нет", () => {
    const withVin = row({ id: 2 });
    withVin.data.vehicle = { brand: "Kia", model: null, year: null, plate: null, vin: "XW8ED45J8DK123456" };
    const [n] = buildFeed([withVin], timeRange);
    expect(n.text).not.toContain("без VIN");
  });

  it("отмена клиентом попадает в ленту с причиной, отмена сервисом — нет", () => {
    const byClient = row({ id: 2, status: "cancelled", cancelled_by: "client", data: { cancelReason: "заболел" } });
    const byShop = row({ id: 3, status: "cancelled", cancelled_by: "shop" });
    const feed = buildFeed([byClient, byShop], timeRange);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Отмена клиентом");
    expect(feed[0].text).toContain("заболел");
  });

  it("зачисленная предоплата — событие, удержанная — нет", () => {
    const paid = row({ id: 4, status: "done", prepay_amount: 500, prepay_status: "released_to_shop" });
    const held = row({ id: 5, status: "confirmed", prepay_amount: 500, prepay_status: "held" });
    const feed = buildFeed([paid, held], timeRange);
    expect(feed.map(n => n.title)).toEqual(["Предоплата зачислена"]);
  });

  it("свежее — сверху", () => {
    const old = row({ id: 6, created_at: localTime("2026-09-10", "10:00").toISOString() });
    const fresh = row({ id: 7, created_at: localTime("2026-09-15", "13:56").toISOString() });
    expect(buildFeed([old, fresh], timeRange).map(n => n.bookingId)).toEqual([7, 6]);
  });

  it("выполненная запись без предоплаты в ленту не лезет", () => {
    expect(buildFeed([row({ id: 8, status: "done" })], timeRange)).toHaveLength(0);
  });
});

describe("группы ленты", () => {
  it("делит на сегодня и раньше, пустую группу не показывает", () => {
    const today = row({ id: 1 });
    const earlier = row({ id: 2, created_at: localTime("2026-09-10", "09:14").toISOString() });
    const groups = groupFeed(buildFeed([today, earlier], timeRange), "2026-09-15", localDay);
    expect(groups.map(g => g.title)).toEqual(["Сегодня", "Ранее"]);
    expect(groups[0].items.map(i => i.bookingId)).toEqual([1]);

    const onlyToday = groupFeed(buildFeed([today], timeRange), "2026-09-15", localDay);
    expect(onlyToday.map(g => g.title)).toEqual(["Сегодня"]);
  });
});
