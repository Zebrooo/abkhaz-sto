import { describe, expect, it } from "vitest";
import { foldLookalike, normalizeVin, plateInput, plateProblem, vinProblem } from "@/lib/vehicle-input";

describe("foldLookalike", () => {
  it("кириллические двойники становятся латиницей", () => {
    expect(foldLookalike("а123ав")).toBe("A123AB");
    expect(foldLookalike("A123AB")).toBe("A123AB");
  });

  it("буквы без латинского двойника остаются как есть", () => {
    expect(foldLookalike("ЖЗИ")).toBe("ЖЗИ");
  });
});

describe("normalizeVin", () => {
  it("17 знаков латиницей — годный VIN", () => {
    expect(normalizeVin("jn1tcnt31u0012345")).toBe("JN1TCNT31U0012345");
  });

  it("пробелы и дефисы не мешают", () => {
    expect(normalizeVin("JN1 TCNT31-U0012345")).toBe("JN1TCNT31U0012345");
  });

  it("набранный кириллицей — тот же VIN", () => {
    // «ХТА» с русской раскладки и «XTA» с латинской — одна машина.
    expect(normalizeVin("ХТА21099010000123")).toBe(normalizeVin("XTA21099010000123"));
  });

  it("короткий, длинный, с I/O/Q и пустой — не VIN", () => {
    expect(normalizeVin("JN1TCNT31U001234")).toBe(null);
    expect(normalizeVin("JN1TCNT31U00123456")).toBe(null);
    expect(normalizeVin("JN1TCNT31U001234O")).toBe(null);
    expect(normalizeVin("")).toBe(null);
    expect(normalizeVin(null)).toBe(null);
  });
});

describe("vinProblem", () => {
  it("пустое поле и годный VIN — без придирок", () => {
    expect(vinProblem("")).toBe(null);
    expect(vinProblem("   ")).toBe(null);
    expect(vinProblem("JN1TCNT31U0012345")).toBe(null);
  });

  it("про длину говорит, сколько набрано", () => {
    expect(vinProblem("JN1TCNT")).toBe("VIN — 17 знаков, а набрано 7");
  });

  it("I, O и Q объясняем отдельно — это самая частая опечатка", () => {
    expect(vinProblem("JN1TCNT31U001234O")).toBe("В VIN не бывает букв I, O и Q — это единица и ноль");
  });

  it("посторонние знаки называем своими словами", () => {
    expect(vinProblem("JN1TCNT31U00123*")).toBe("VIN — только латинские буквы и цифры");
  });
});

describe("plateInput", () => {
  it("номер сохраняется написанием человека, но без лишних пробелов", () => {
    expect(plateInput(" а 123  ав 01 ")).toBe("А 123 АВ 01");
    expect(plateInput("a123ab")).toBe("A123AB");
  });

  it("слишком короткое номером не считается", () => {
    expect(plateInput("а12")).toBe(null);
    expect(plateInput("")).toBe(null);
    expect(plateInput(null)).toBe(null);
  });

  it("слова номером не считаются: иначе они станут ключом карточки машины", () => {
    expect(plateInput("привезёт вечером")).toBe(null);
    expect(plateInput("123456")).toBe(null);
    expect(plateInput("АВСДЕ")).toBe(null);
    expect(plateProblem("привезёт вечером")).toBe("Госномер — буквы и цифры с таблички, без лишних слов");
  });

  it("problem молчит на пустом и ругается на коротком", () => {
    expect(plateProblem("")).toBe(null);
    expect(plateProblem("А123АВ")).toBe(null);
    expect(plateProblem("А12")).toBe("Госномер короче, чем бывает — проверьте");
  });
});
