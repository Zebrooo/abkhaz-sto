import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Сторож секции @section:ios-zoom в globals.css. iOS увеличивает страницу при
// фокусе в поле мельче 16px и масштаб назад не возвращает — шторки и экраны
// после этого рисуются шире телефона. Поэтому каждое правило, которое на
// телефоне задаёт полю размер мельче 16px, обязано быть перекрыто полом
// 16px, стоящим ПОЗЖЕ (у одинаковых селекторов выигрывает поздний).

type Rule = { at: number; media: string; selectors: string[]; body: string };

/** Плоский разбор: правила верхнего уровня и правила внутри @media. */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (from: number, to: number, media: string) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf("{", i);
      if (open === -1 || open >= to) return;
      const head = src.slice(i, open).trim();
      let depth = 1;
      let close = open + 1;
      for (; depth > 0; close++) {
        if (src[close] === "{") depth++;
        else if (src[close] === "}") depth--;
      }
      if (head.startsWith("@media")) walk(open + 1, close - 1, head);
      else if (!head.startsWith("@")) {
        out.push({ at: open, media, selectors: head.split(",").map(s => s.trim().replace(/\s+/g, " ")), body: src.slice(open + 1, close - 1) });
      }
      i = close;
    }
  };
  walk(0, src.length, "");
  return out;
}

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const all = rules(css);
/** На телефоне действуют правила без @media и с max-width; min-width — веб. */
const onPhone = (r: Rule) => !/min-width/.test(r.media);
const px = (body: string) => {
  const m = /(?:^|;)\s*font-size:\s*([\d.]+)px/.exec(body);
  return m ? Number(m[1]) : null;
};
const isField = (sel: string) => /(^|[\s>+~])(input|select|textarea)\b/.test(sel);

describe("поля на телефоне — не мельче 16px (iOS не зумит страницу)", () => {
  const floors = all.filter(r => /max-width:\s*880px/.test(r.media) && px(r.body) === 16
    && ["input", "select", "textarea"].every(s => r.selectors.includes(s)));

  it("пол 16px есть и покрывает сами элементы полей", () => {
    expect(floors).toHaveLength(1);
  });

  it("каждое правило, где поле мельче 16px, перекрыто полом позже", () => {
    const floor = floors[0];
    const small = all.filter(r => onPhone(r) && r !== floor && (px(r.body) ?? 16) < 16);
    const fields = small.flatMap(r => r.selectors.filter(isField).map(sel => ({ sel, at: r.at })));
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(floor.selectors, `«${f.sel}» мельче 16px, а в секции ios-zoom его нет`).toContain(f.sel);
      expect(floor.at, `«${f.sel}» стоит после секции ios-zoom и перебивает её`).toBeGreaterThan(f.at);
    }
  });

  it("крупные поля (пробег, цена) пол не уменьшает: он без !important", () => {
    expect(floors[0].body).not.toMatch(/!important/);
  });
});
