import { describe, expect, it } from "vitest";
import { clientLine, clientPills, clientViews, formatClientDates, matchGoodsClient, parseClientDates } from "@/lib/goods/clients";
import { CLIENT_DORMANT, CLIENT_MADINA, CLIENT_REGULAR, CLIENT_WARRANTY, NOW } from "@/lib/goods/fixtures";
import { rub } from "@/lib/format";

describe("клиенты магазина", () => {
  it("чипы по вертикали: цветам праздники, электронике — гарантия", () => {
    expect(clientViews("flowers")).toEqual(["all", "regular", "holidays", "dormant"]);
    expect(clientViews("electronics")).toEqual(["all", "regular", "warranty", "dormant"]);
    expect(clientViews("general")).toContain("holidays");
  });

  it("строка под именем — заказы, сумма, давность", () => {
    expect(clientLine(CLIENT_MADINA, NOW)).toBe(`2 заказа · ${rub(17400)} · последний сегодня`);
    expect(clientLine(CLIENT_DORMANT, NOW)).toBe(`1 заказ · ${rub(2400)} · последний 4 месяца назад`);
  });

  it("пилюли: ближайшая дата, постоянный, давно, гарантия", () => {
    expect(clientPills(CLIENT_MADINA)).toEqual([{ text: "день рождения мамы · 19.10", tone: "warn" }]);
    expect(clientPills(CLIENT_REGULAR)).toEqual([{ text: "постоянный", tone: "ok" }]);
    expect(clientPills(CLIENT_DORMANT)).toEqual([{ text: "давно без заказов", tone: "neu" }]);
    expect(clientPills(CLIENT_WARRANTY)).toEqual([
      { text: "предложить апгрейд · 01.12", tone: "neu" },
      { text: "гарантия до 02.11", tone: "dng" },
    ]);
  });

  it("даты из текста: строка на дату, «апгрейд:» — пометка вида", () => {
    expect(parseClientDates("19.10 день рождения мамы\n\n08.03 8 марта\n1.12 апгрейд: предложить ноут\n")).toEqual({
      ok: true,
      dates: [
        { label: "день рождения мамы", day: "10-19", kind: "holiday" },
        { label: "8 марта", day: "03-08", kind: "holiday" },
        { label: "предложить ноут", day: "12-01", kind: "upgrade_offered" },
      ],
    });
    expect(parseClientDates("")).toEqual({ ok: true, dates: [] });
  });

  it("кривая строка — отказ с её номером", () => {
    expect(parseClientDates("19.10 мама\n32.13 мусор")).toEqual({ ok: false, error: expect.stringMatching(/^Строка 2:/) });
    expect(parseClientDates("просто текст").ok).toBe(false);
  });

  it("обратно в текст — тем же видом", () => {
    const text = formatClientDates(CLIENT_WARRANTY.dates.concat(CLIENT_MADINA.dates));
    expect(text).toBe("01.12 апгрейд: предложить апгрейд\n19.10 день рождения мамы");
    expect(parseClientDates(text)).toEqual({ ok: true, dates: [...CLIENT_WARRANTY.dates, ...CLIENT_MADINA.dates] });
  });

  it("поиск по имени, телефону и заметке", () => {
    expect(matchGoodsClient(CLIENT_MADINA, "хагба")).toBe(true);
    expect(matchGoodsClient(CLIENT_MADINA, "111 22")).toBe(true);
    expect(matchGoodsClient(CLIENT_MADINA, "пионы")).toBe(true);
    expect(matchGoodsClient(CLIENT_MADINA, "амра")).toBe(false);
  });
});
