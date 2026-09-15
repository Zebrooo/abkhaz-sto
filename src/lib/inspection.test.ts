import { describe, expect, it } from "vitest";
import {
  bySeverity, chipTitle, countBySeverity, customWorks, inspectionState, isStarterSet, kmLabel,
  MAX_ODOMETER_KM, NEGOTIABLE_WORK, nodesLabel, parseOdometer, photoIdsFrom, untouchedNodeKeys,
} from "@/lib/inspection";
import { INSPECTION_NODES } from "@/lib/inspection-nodes";

describe("норма — вычитанием", () => {
  it("без дефектов в норме все узлы, дефект убирает свой узел один раз", () => {
    expect(untouchedNodeKeys([])).toHaveLength(INSPECTION_NODES.length);
    const rest = untouchedNodeKeys([{ nodeKey: "brakes" }, { nodeKey: "brakes" }, { nodeKey: "tires" }]);
    expect(rest).toHaveLength(INSPECTION_NODES.length - 2);
    expect(rest).not.toContain("brakes");
    expect(rest).not.toContain("tires");
  });

  // Отчёт следующей версии приложения может принести узел, которого здесь
  // нет: он не должен ни уменьшать «норму», ни ронять экран.
  it("незнакомый узел не трогает список", () => {
    expect(untouchedNodeKeys([{ nodeKey: "turbo" }])).toHaveLength(INSPECTION_NODES.length);
  });

  it("склонение «узлов» — с ловушками 11 и 21", () => {
    expect(nodesLabel(1)).toBe("1 узел");
    expect(nodesLabel(2)).toBe("2 узла");
    expect(nodesLabel(5)).toBe("5 узлов");
    expect(nodesLabel(11)).toBe("11 узлов");
    expect(nodesLabel(21)).toBe("21 узел");
  });
});

describe("состояние осмотра", () => {
  it("считает критичное и внимание, заголовок склоняет", () => {
    const list = [
      { nodeKey: "brakes", severity: "bad" as const },
      { nodeKey: "tires", severity: "warn" as const },
      { nodeKey: "susp", severity: "bad" as const },
    ];
    expect(countBySeverity(list)).toEqual({ bad: 2, warn: 1 });
    expect(inspectionState(3).title).toBe("3 дефекта");
    expect(inspectionState(1).title).toBe("1 дефект");
    expect(inspectionState(0)).toEqual({ title: "Пока всё в норме", sub: "отмечайте только то, что нашли" });
  });

  // Порядок внутри группы — порядок мастера: две карточки «внимание» не
  // должны меняться местами при каждом обновлении экрана.
  it("критичное сверху, остальное как записано", () => {
    const list = [
      { id: 1, nodeKey: "tires", severity: "warn" as const },
      { id: 2, nodeKey: "brakes", severity: "bad" as const },
      { id: 3, nodeKey: "elec", severity: "warn" as const },
      { id: 4, nodeKey: "susp", severity: "bad" as const },
    ];
    expect(bySeverity(list).map(d => d.id)).toEqual([2, 4, 1, 3]);
    expect(list.map(d => d.id)).toEqual([1, 2, 3, 4]); // исходный список не тронут
  });
});

describe("частые формулировки", () => {
  it("стартовый набор — когда счётчики нулевые у всех, а не когда список пуст", () => {
    expect(isStarterSet([{ uses: 0 }, { uses: 0 }])).toBe(true);
    expect(isStarterSet([{ uses: 0 }, { uses: 3 }])).toBe(false);
    expect(isStarterSet([])).toBe(false);
  });

  it("длинная формулировка в чипе уступает имени узла", () => {
    expect(chipTitle("Колодки стёрты до 2 мм", "Тормоза")).toBe("Колодки стёрты до 2 мм");
    expect(chipTitle("Неравномерный износ передних шин", "Шины и диски")).toBe("Шины и диски");
  });
});

describe("пробег", () => {
  it("принимает число с пробелами, отвергает всё остальное", () => {
    expect(parseOdometer("41 200")).toEqual({ ok: true, km: 41200 });
    expect(parseOdometer("0")).toEqual({ ok: true, km: 0 });
    expect(parseOdometer("").ok).toBe(false);
    expect(parseOdometer("-5").ok).toBe(false);
    expect(parseOdometer("1e5").ok).toBe(false);
    expect(parseOdometer("41,2").ok).toBe(false);
    expect(parseOdometer(String(MAX_ODOMETER_KM + 1)).ok).toBe(false);
  });

  it("подпись с разрядами", () => {
    expect(kmLabel(187000)).toBe("187 000 км");
  });
});

describe("фото и работы", () => {
  it("идентификаторы фото: без мусора, без повторов, не больше четырёх", () => {
    expect(photoIdsFrom(["a", "a", "", 42, "b c", "d", "e", "f", "g"])).toEqual(["a", "d", "e", "f"]);
  });

  it("чипы работ не повторяются и всегда заканчиваются «договорной»", () => {
    const works = customWorks([
      { work: "Замена колодок", price: 4200 },
      { work: "Замена колодок", price: 4200 },
      { work: "Шлифовка дисков", price: 3200 },
      { work: "", price: null },
    ]);
    expect(works.map(w => w.work)).toEqual(["Замена колодок", "Шлифовка дисков", NEGOTIABLE_WORK]);
    expect(works.at(-1)?.price).toBeNull();
    expect(customWorks([])).toEqual([{ work: NEGOTIABLE_WORK, price: null }]);
  });
});
