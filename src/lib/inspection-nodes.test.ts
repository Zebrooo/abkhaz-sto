import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INSPECTION_NODES, isNodeKey, nodeIcon, nodeName } from "@/lib/inspection-nodes";

describe("узлы осмотра", () => {
  it("ключи уникальны", () => {
    const keys = INSPECTION_NODES.map(n => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Иконку узла рисует Icon по имени: имени нет — пустая дырка на плитке в
  // шторке «Новый дефект», и это не ловит ни линт, ни типы после правки
  // словаря руками.
  it("иконка каждого узла есть в наборе Icon", () => {
    const source = readFileSync(resolve("src/components/Icon.tsx"), "utf8");
    const known = new Set([...source.matchAll(/^\s{2}([A-Za-z]+):\s*</gm)].map(m => m[1]));
    expect(known.size).toBeGreaterThan(10);
    for (const n of INSPECTION_NODES) {
      expect(known.has(n.icon), `иконки ${n.icon} нет в Icon.tsx`).toBe(true);
    }
  });

  // Отчёт, написанный следующей версией приложения, должен читаться этой:
  // незнакомый узел показываем как есть, а не роняем экран.
  it("незнакомый ключ не ломает подпись", () => {
    expect(nodeName("brakes")).toBe("Тормоза");
    expect(nodeName("turbo")).toBe("turbo");
    expect(nodeIcon("turbo")).toBe("box");
    expect(isNodeKey("turbo")).toBe(false);
    expect(isNodeKey("brakes")).toBe(true);
  });
});
