import { describe, expect, it } from "vitest";
import { dayDropAt, dropAt, dropWarning, hhmmOf, overlapDepth, type DragBlock } from "@/lib/drag";

const DAY = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }];
const block = (id: number, postNo: number, from: string, to: string, title = "Услуга"): DragBlock => ({
  id, postNo, title,
  fromMin: Number(from.slice(0, 2)) * 60 + Number(from.slice(3)),
  toMin: Number(to.slice(0, 2)) * 60 + Number(to.slice(3)),
});

const drop = (minute: number, over: Partial<Parameters<typeof dropAt>[0]> = {}) => dropAt({
  intervals: DAY, stepMin: 30, bufferMin: 0, durationMin: 60, postNo: 1, minute, blocks: [], movingId: 1, ...over,
});

describe("hhmmOf", () => {
  it("минуты дня — в часы и минуты", () => {
    expect(hhmmOf(0)).toBe("00:00");
    expect(hhmmOf(9 * 60 + 30)).toBe("09:30");
    expect(hhmmOf(23 * 60 + 59)).toBe("23:59");
  });
});

describe("dropAt — притяжение к сетке", () => {
  it("тянет к ближайшему узлу шага", () => {
    expect(drop(9 * 60 + 12).fromMin).toBe(9 * 60);
    expect(drop(9 * 60 + 20).fromMin).toBe(9 * 60 + 30);
  });

  it("узлы считаются от начала интервала, а не от полуночи", () => {
    const res = dropAt({
      intervals: [{ from: "09:20", to: "18:00" }], stepMin: 30, bufferMin: 0, durationMin: 60,
      postNo: 1, minute: 9 * 60 + 45, blocks: [], movingId: 1,
    });
    expect(hhmmOf(res.fromMin)).toBe("09:50");
  });

  it("не даёт записи вылезти за конец смены", () => {
    expect(drop(17 * 60 + 50).reason).toBe("closed");
    expect(hhmmOf(drop(17 * 60).fromMin)).toBe("17:00");
    expect(drop(17 * 60).reason).toBe(null);
  });

  it("у края интервала притягивает внутрь", () => {
    expect(drop(8 * 60 + 50).reason).toBe(null);
    expect(hhmmOf(drop(8 * 60 + 50).fromMin)).toBe("09:00");
    expect(drop(8 * 60 + 30).reason).toBe("closed");
  });

  it("край обеда притягивает к началу следующего интервала", () => {
    expect(hhmmOf(drop(13 * 60 + 50).fromMin)).toBe("14:00");
    expect(drop(13 * 60 + 50).reason).toBe(null);
  });
});

describe("dropAt — вне часов приёма", () => {
  it("середина обеда — красное окно там, где курсор", () => {
    const res = drop(13 * 60 + 15);
    expect(res.reason).toBe("closed");
    expect(hhmmOf(res.fromMin)).toBe("13:30");
  });

  it("выходной — окон нет вовсе", () => {
    expect(drop(10 * 60, { intervals: [] }).reason).toBe("closed");
  });

  it("услуга длиннее интервала приёма не встаёт в него", () => {
    const res = dropAt({
      intervals: [{ from: "09:00", to: "10:00" }], stepMin: 30, bufferMin: 0, durationMin: 120,
      postNo: 1, minute: 9 * 60, blocks: [], movingId: 1,
    });
    expect(res.reason).toBe("closed");
  });
});

describe("dropAt — наложение записей", () => {
  const busy = [block(2, 1, "10:00", "11:00", "Замена масла"), block(3, 2, "10:00", "11:00")];

  it("на запись того же поста — overlap и виновник в conflicts", () => {
    const res = drop(10 * 60 + 30, { blocks: busy });
    expect(res.reason).toBe("overlap");
    expect(res.conflicts).toEqual([2]);
  });

  it("соседний пост в то же время свободен", () => {
    const res = drop(10 * 60, { postNo: 3, blocks: busy });
    expect(res.reason).toBe(null);
    expect(res.conflicts).toEqual([]);
  });

  it("сама себя запись не задевает", () => {
    expect(drop(10 * 60, { blocks: busy, movingId: 2 }).reason).toBe(null);
  });

  it("стык встык — не пересечение", () => {
    expect(drop(11 * 60, { blocks: busy }).reason).toBe(null);
  });

  it("буфер сервиса держит пост и после, и перед записью", () => {
    expect(drop(11 * 60, { blocks: busy, bufferMin: 15 }).reason).toBe("buffer");
    expect(drop(9 * 60, { blocks: busy, bufferMin: 15 }).reason).toBe("buffer");
    expect(drop(11 * 60 + 30, { blocks: busy, bufferMin: 15 }).reason).toBe(null);
  });

  it("наложение важнее часов приёма: сначала говорим про чужую запись", () => {
    const res = drop(12 * 60 + 40, { blocks: [block(2, 1, "12:30", "13:00")] });
    expect(res.reason).toBe("overlap");
  });
});

describe("dropWarning", () => {
  const busy = [block(2, 1, "10:00", "11:00", "Замена масла")];

  it("наложение — с именем и временем чужой записи", () => {
    expect(dropWarning(drop(10 * 60 + 30, { blocks: busy }), busy))
      .toBe("Занято: время накладывается на «Замена масла» 10:00–11:00");
  });

  it("буфер — со сколькими минутами перерыва", () => {
    expect(dropWarning(drop(11 * 60, { blocks: busy, bufferMin: 15 }), busy, 15))
      .toContain("перерыв 15 мин");
  });

  it("свободно — куда встанет запись", () => {
    expect(dropWarning(drop(15 * 60), [])).toBe("Перенести на 15:00–16:00, пост 1");
  });
});

describe("dropAt — прошедшее время", () => {
  it("раньше pastBefore — причина past", () => {
    expect(drop(10 * 60, { pastBefore: 12 * 60 }).reason).toBe("past");
    expect(drop(15 * 60, { pastBefore: 12 * 60 }).reason).toBe(null);
  });

  it("наложение важнее прошедшего", () => {
    expect(drop(10 * 60, { pastBefore: 12 * 60, blocks: [block(2, 1, "10:00", "11:00")] }).reason).toBe("overlap");
  });

  it("без pastBefore прошлое не считается — как раньше", () => {
    expect(drop(10 * 60).reason).toBe(null);
  });

  it("past — со своим текстом", () => {
    expect(dropWarning(drop(10 * 60, { pastBefore: 12 * 60 }), [])).toContain("уже прошло");
  });
});

describe("overlapDepth — лесенка наложений", () => {
  it("без наложений глубина 0", () => {
    const bs = [block(1, 1, "09:00", "10:00"), block(2, 1, "10:00", "11:00")];
    expect(overlapDepth(bs).get(2)).toBe(0);
  });

  it("запись внутри другой — глубина 1, третья поверх — 2", () => {
    const bs = [block(1, 1, "09:00", "12:00"), block(2, 1, "09:30", "10:30"), block(3, 1, "09:45", "10:15")];
    const d = overlapDepth(bs);
    expect(d.get(1)).toBe(0);
    expect(d.get(2)).toBe(1);
    expect(d.get(3)).toBe(2);
  });

  it("одинаковое начало — глубже та, что с большим id", () => {
    const bs = [block(5, 1, "09:00", "10:00"), block(4, 1, "09:00", "10:00")];
    const d = overlapDepth(bs);
    expect(d.get(4)).toBe(0);
    expect(d.get(5)).toBe(1);
  });

  it("другой пост не считается", () => {
    const bs = [block(1, 1, "09:00", "12:00"), block(2, 2, "09:30", "10:30")];
    expect(overlapDepth(bs).get(2)).toBe(0);
  });
});

describe("dayDropAt — бросок на другой день недели", () => {
  const day = (over: Partial<Parameters<typeof dayDropAt>[0]> = {}) => dayDropAt({
    day: "2026-09-17", intervals: DAY, posts: 2, bufferMin: 0, fromMin: 10 * 60, durationMin: 60,
    blocks: [], movingId: 1, ...over,
  });

  it("пустой день — первый пост", () => {
    expect(day()).toMatchObject({ postNo: 1, reason: null });
  });

  it("первый пост занят — берём второй, как сервер", () => {
    expect(day({ blocks: [block(2, 1, "10:00", "11:00")] })).toMatchObject({ postNo: 2, reason: null });
  });

  it("все посты заняты — busy и виновники", () => {
    const res = day({ blocks: [block(2, 1, "10:00", "11:00"), block(3, 2, "09:30", "10:30")] });
    expect(res.reason).toBe("busy");
    expect(res.postNo).toBe(null);
    expect(res.conflicts).toEqual([2, 3]);
  });

  it("выходной и время вне приёма", () => {
    expect(day({ intervals: [] }).reason).toBe("off");
    expect(day({ fromMin: 13 * 60 + 30 }).reason).toBe("closed");
  });

  it("буфер учитывается и здесь", () => {
    expect(day({ fromMin: 11 * 60, posts: 1, bufferMin: 15, blocks: [block(2, 1, "10:00", "11:00")] }).reason).toBe("busy");
  });

  it("день целиком прошёл — past, но пост найден", () => {
    expect(day({ pastBefore: Infinity })).toMatchObject({ postNo: 1, reason: "past" });
  });

  it("занятость важнее прошедшего", () => {
    const res = day({ pastBefore: Infinity, blocks: [block(2, 1, "10:00", "11:00"), block(3, 2, "09:30", "10:30")] });
    expect(res.reason).toBe("busy");
  });
});
