import { describe, expect, it } from "vitest";
import {
  addAccepted, addMark, currentPost, emptyHold, parsePostHold, postAt, serializePostHold, type PostHold,
} from "@/lib/post-hold";

const WHO = { shopId: 7, userId: "u-1", day: "2026-09-17" };
const hold = (marks: { postNo: number; at: string }[] = [], accepted: number[] = []): PostHold => ({ ...WHO, marks, accepted });

describe("parsePostHold", () => {
  it("своя отметка читается", () => {
    const raw = serializePostHold(hold([{ postNo: 2, at: "09:05" }], [11]));
    expect(parsePostHold(raw, WHO)).toEqual(hold([{ postNo: 2, at: "09:05" }], [11]));
  });

  it("чужой сервис, чужая учётка и вчерашний день не читаются", () => {
    const raw = serializePostHold(hold([{ postNo: 2, at: "09:05" }]));
    expect(parsePostHold(raw, { ...WHO, shopId: 8 })).toBeNull();
    expect(parsePostHold(raw, { ...WHO, userId: "u-2" })).toBeNull();
    expect(parsePostHold(raw, { ...WHO, day: "2026-09-18" })).toBeNull();
  });

  it("мусор и пустота — null, а не исключение", () => {
    expect(parsePostHold("не json", WHO)).toBeNull();
    expect(parsePostHold("", WHO)).toBeNull();
    expect(parsePostHold(null, WHO)).toBeNull();
    expect(parsePostHold("[]", WHO)).toBeNull();
  });

  it("кривые отметки выбрасываются, целые остаются и сортируются", () => {
    const raw = JSON.stringify({
      ...WHO,
      marks: [{ postNo: 3, at: "14:30" }, { postNo: 0, at: "10:00" }, { postNo: 2, at: "25:00" }, { postNo: 2, at: "09:05" }],
      accepted: [11, -2, 0, 12.5],
    });
    const parsed = parsePostHold(raw, WHO)!;
    expect(parsed.marks).toEqual([{ postNo: 2, at: "09:05" }, { postNo: 3, at: "14:30" }]);
    expect(parsed.accepted).toEqual([11]);
  });
});

describe("addMark и currentPost", () => {
  it("отметки копятся по времени, текущий пост — последняя", () => {
    const h = addMark(addMark(emptyHold(WHO), 2, "09:05"), 3, "14:30");
    expect(h.marks).toEqual([{ postNo: 2, at: "09:05" }, { postNo: 3, at: "14:30" }]);
    expect(currentPost(h)).toBe(3);
  });

  it("тот же пост подряд историю не раздувает", () => {
    const h = addMark(addMark(emptyHold(WHO), 2, "09:05"), 2, "09:06");
    expect(h.marks).toHaveLength(1);
  });

  it("вернуться на прежний пост — новая отметка, а не тишина", () => {
    const h = addMark(addMark(addMark(emptyHold(WHO), 2, "09:05"), 3, "14:30"), 2, "16:00");
    expect(h.marks).toHaveLength(3);
    expect(currentPost(h)).toBe(2);
  });

  it("не отмечался — поста нет", () => {
    expect(currentPost(emptyHold(WHO))).toBeNull();
    expect(currentPost(null)).toBeNull();
  });

  it("кривой пост и кривое время отметку не создают", () => {
    expect(addMark(emptyHold(WHO), 0, "09:05").marks).toHaveLength(0);
    expect(addMark(emptyHold(WHO), 2, "9:5").marks).toHaveLength(0);
  });
});

describe("addAccepted", () => {
  it("номер записи запоминается один раз", () => {
    const h = addAccepted(addAccepted(emptyHold(WHO), 11), 11);
    expect(h.accepted).toEqual([11]);
  });

  it("мусор не запоминается", () => {
    expect(addAccepted(emptyHold(WHO), 0).accepted).toEqual([]);
  });
});

describe("postAt — чей пост в это время", () => {
  const marks = [{ postNo: 2, at: "09:05" }, { postNo: 3, at: "14:30" }];

  it("до обеда — прежний пост, после — новый", () => {
    expect(postAt(marks, "10:00")).toBe(2);
    expect(postAt(marks, "14:29")).toBe(2);
    expect(postAt(marks, "14:30")).toBe(3);
    expect(postAt(marks, "17:00")).toBe(3);
  });

  it("запись началась чуть раньше отметки — всё равно его", () => {
    expect(postAt(marks, "09:00")).toBe(2);
    expect(postAt(marks, "08:30")).toBe(2);
  });

  it("утро задним числом не присваивается: отметились в 14:30 — утро не ваше", () => {
    expect(postAt([{ postNo: 3, at: "14:30" }], "09:00")).toBeNull();
    expect(postAt([{ postNo: 3, at: "14:30" }], "13:35")).toBe(3);
  });

  it("без отметок и с кривым временем — ничего", () => {
    expect(postAt([], "10:00")).toBeNull();
    expect(postAt(marks, "не время")).toBeNull();
  });

  it("порядок отметок в списке значения не имеет", () => {
    expect(postAt([{ postNo: 3, at: "14:30" }, { postNo: 2, at: "09:05" }], "10:00")).toBe(2);
  });
});
