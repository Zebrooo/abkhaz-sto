import { describe, expect, it } from "vitest";
import { PULL_MAX, PULL_SLOP, PULL_TRIGGER, pullMove } from "@/lib/pull";

describe("pullMove", () => {
  // Таймлайн и ленту дней листают пальцем поперёк — если забрать такой жест
  // себе, экран перестанет прокручиваться вовсе.
  it("вбок и вверх — жест экрана, не наш", () => {
    expect(pullMove(false, 4, 40)).toEqual({ kind: "drop" });
    expect(pullMove(false, -30, 0)).toEqual({ kind: "drop" });
  });

  it("мелкое дрожание — ждём, ничего не перехватывая", () => {
    expect(pullMove(false, 3, 3)).toEqual({ kind: "wait" });
    expect(pullMove(false, PULL_SLOP - 1, 0)).toEqual({ kind: "wait" });
  });

  it("вниз — натяжение с сопротивлением и упором", () => {
    const a = pullMove(false, 48, 2);
    expect(a.kind).toBe("pull");
    expect(a).toMatchObject({ dist: (48 - PULL_SLOP) * 0.55 });
    expect(pullMove(true, 10_000, 0)).toEqual({ kind: "pull", dist: PULL_MAX });
  });

  // Отметка обязана быть достижимой пальцем: порог выше упора значил бы, что
  // жест не срабатывает никогда, и это не поймал бы ни один экранный тест.
  it("до отметки палец дотягивается, не упираясь в предел", () => {
    expect(PULL_TRIGGER).toBeLessThan(PULL_MAX);
    const pulled = pullMove(false, 160, 0);
    expect(pulled.kind === "pull" && pulled.dist >= PULL_TRIGGER).toBe(true);
  });

  // Раздумал на полпути: жест остаётся нашим (экран под пальцем не должен
  // вдруг поехать), но натяжение сходит в ноль — и обновления не будет.
  it("решённый жест ведёт палец и назад вверх — натяжение в ноль", () => {
    expect(pullMove(true, -50, 0)).toEqual({ kind: "pull", dist: 0 });
  });
});
