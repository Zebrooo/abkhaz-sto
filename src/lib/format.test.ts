import { describe, expect, it } from "vitest";
import {
  addDays, agoLabel, count, dayLabel, dayNumber, dayOfWeekLabel, dayOfWeekShort,
  dayEyebrow, dayShort, dayTitle, formatPhone, initials, minutesLabel, rangeLabel, relativeAt, rub, shortName, timeRange, weekStart,
} from "@/lib/format";
import { localTime } from "@/lib/sto/slots";

// Всё считается по часам сервиса (+03:00): здесь это и проверяем.
describe("даты", () => {
  it("подписи дня", () => {
    expect(dayLabel("2026-09-15")).toBe("15 сентября, вторник");
    expect(dayTitle("2026-09-15")).toBe("15 сентября");
    expect(dayOfWeekLabel("2026-09-15")).toBe("вторник");
    expect(dayOfWeekShort("2026-09-15")).toBe("вт");
    expect(dayNumber("2026-09-15")).toBe(15);
    expect(dayShort("2026-09-15")).toBe("15.09");
    expect(dayEyebrow("2026-09-15")).toBe("вторник, 15 сентября");
  });

  it("неделя начинается с понедельника", () => {
    expect(weekStart("2026-09-15")).toBe("2026-09-14");
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14"); // воскресенье — всё ещё та неделя
  });

  it("сдвиг дней переходит через месяц", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("диапазон недели", () => {
    expect(rangeLabel("2026-09-14", "2026-09-20")).toBe("14 – 20 сентября");
    expect(rangeLabel("2026-09-28", "2026-10-04")).toBe("28 сентября – 4 октября");
  });

  it("время записи — по часам сервиса", () => {
    expect(timeRange(localTime("2026-09-15", "11:00"), localTime("2026-09-15", "12:30"))).toBe("11:00–12:30");
  });
});

describe("числа и слова", () => {
  it("деньги с русским разделителем", () => {
    // Разделитель тысяч у ru-RU — неразрывный пробел, поэтому сравниваем нормализованно.
    const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
    expect(plain(rub(12400))).toBe("12 400 ₽");
    expect(plain(rub(0))).toBe("0 ₽");
  });

  it("длительность по-человечески", () => {
    expect(minutesLabel(45)).toBe("45 мин");
    expect(minutesLabel(60)).toBe("1 ч");
    expect(minutesLabel(90)).toBe("1 ч 30 мин");
    expect(minutesLabel(180)).toBe("3 ч");
  });

  it("склонения", () => {
    expect(count(1, "запись", "записи", "записей")).toBe("1 запись");
    expect(count(2, "запись", "записи", "записей")).toBe("2 записи");
    expect(count(5, "запись", "записи", "записей")).toBe("5 записей");
    expect(count(11, "запись", "записи", "записей")).toBe("11 записей");
    expect(count(21, "запись", "записи", "записей")).toBe("21 запись");
  });

  it("короткое имя для тесных строк", () => {
    expect(shortName("Гурам Броцман")).toBe("Гурам Б.");
    expect(shortName("Нана")).toBe("Нана");
    expect(shortName("Клиент с сайта")).toBe("Клиент с сайта");
  });

  it("телефон читается вслух", () => {
    expect(formatPhone("+79409211408")).toBe("+7 940 921-14-08");
    // Сюда приходит уже нормализованный номер (normalizePhone), сырой не трогаем.
    expect(formatPhone("89409211408")).toBe("89409211408");
    expect(formatPhone("+995 555 123456")).toBe("+995 555 123456");
    expect(formatPhone(null)).toBe("");
  });

  it("инициалы", () => {
    expect(initials("Аслан Кове")).toBe("АК");
    expect(initials("Нана")).toBe("Н");
    expect(initials("  ")).toBe("—");
  });
});

describe("когда это было", () => {
  const now = localTime("2026-09-15", "14:10");

  it("минуты назад, сегодняшнее время, вчера и дата", () => {
    expect(relativeAt(localTime("2026-09-15", "13:56"), now)).toBe("14 минут назад");
    expect(relativeAt(localTime("2026-09-15", "09:30"), now)).toBe("09:30");
    expect(relativeAt(localTime("2026-09-14", "19:02"), now)).toBe("вчера, 19:02");
    expect(relativeAt(localTime("2026-09-01", "19:02"), now)).toBe("01.09, 19:02");
  });

  it("давность визита", () => {
    expect(agoLabel(localTime("2026-09-15", "09:00"), now)).toBe("сегодня");
    expect(agoLabel(localTime("2026-09-14", "09:00"), now)).toBe("вчера");
    expect(agoLabel(localTime("2026-09-11", "09:00"), now)).toBe("4 дня");
    expect(agoLabel(localTime("2026-09-01", "09:00"), now)).toBe("2 недели");
    expect(agoLabel(localTime("2026-07-15", "09:00"), now)).toBe("2 месяца");
    expect(agoLabel(localTime("2025-09-15", "09:00"), now)).toBe("1 год");
  });
});
