// Чистая арифметика экранов осмотра и отчёта: без базы и сети, чтобы её
// можно было проверить тестом. Всё, что здесь считается, — подписи и порядок
// на экране; деньги сметы приложение не складывает (docs/API-sushchnosti.md),
// их присылает сайт вместе с отчётом.
import type { Severity } from "@/lib/api/inspections";
import { count } from "@/lib/format";
import { INSPECTION_NODES } from "@/lib/inspection-nodes";

/** Минимум, который нужен подсчётам от дефекта, — чтобы не тащить фото и даты в тесты. */
export type DefectLike = { nodeKey: string; severity: Severity };

/**
 * Узлы, до которых мастер не дотронулся, — по порядку словаря. Это подпись
 * «остальные N узлов» и счётчик «норма» в карточке записи; в отчёте тот же
 * список приезжает с сайта (okNodeKeys), чтобы экран и PDF не разошлись.
 * Незнакомый узел из чужой версии приложения список не уменьшает и не роняет.
 */
export function untouchedNodeKeys(defects: readonly { nodeKey: string }[]): string[] {
  const touched = new Set(defects.map(d => d.nodeKey));
  return INSPECTION_NODES.map(n => n.key).filter(k => !touched.has(k));
}

/** «5 узлов», «1 узел», «22 узла». */
export function nodesLabel(n: number): string {
  return count(n, "узел", "узла", "узлов");
}

export function countBySeverity(defects: readonly DefectLike[]): { bad: number; warn: number } {
  let bad = 0, warn = 0;
  for (const d of defects) {
    if (d.severity === "bad") bad += 1;
    else warn += 1;
  }
  return { bad, warn };
}

/** Заголовок состояния осмотра: «3 дефекта» или «Пока всё в норме», с подписью. */
export function inspectionState(defectCount: number): { title: string; sub: string } {
  return defectCount > 0
    ? { title: count(defectCount, "дефект", "дефекта", "дефектов"), sub: "остальное уйдёт как «в норме»" }
    : { title: "Пока всё в норме", sub: "отмечайте только то, что нашли" };
}

/**
 * Порядок карточек в отчёте: критичное сверху, внутри группы — как записал
 * мастер. Сортировка устойчивая, иначе два «внимания» меняются местами при
 * каждом обновлении экрана.
 */
export function bySeverity<T extends DefectLike>(defects: readonly T[]): T[] {
  return [...defects].sort((a, b) => Number(a.severity !== "bad") - Number(b.severity !== "bad"));
}

/**
 * У сервиса ещё нет своей статистики: сайт отдал стартовый набор, и ни одну
 * формулировку здесь не добавляли (uses = 0 у всех). Тогда строка называется
 * «Стартовый набор — частое в автосервисах», а не «Вы добавляете чаще всего»:
 * второе было бы неправдой. Пустой список — не стартовый набор, а пустота.
 */
export function isStarterSet(presets: readonly { uses: number }[]): boolean {
  return presets.length > 0 && presets.every(p => p.uses === 0);
}

/**
 * Подпись чипа «частого»: длинная формулировка не влезает в чип и режется
 * многоточием, поэтому вместо неё — имя узла (порог и правило из макета).
 */
export const CHIP_TITLE_MAX = 26;
export function chipTitle(title: string, nodeName: string): string {
  return title.length > CHIP_TITLE_MAX ? nodeName : title;
}

/** Пробег: верхняя граница, за которой это уже опечатка, а не машина. */
export const MAX_ODOMETER_KM = 2_000_000;

/**
 * Пробег из поля формы. Люди пишут «41 200» с пробелом — принимаем; всё, что
 * не целое число километров, — отказ с объяснением. Ноль допустим: машина
 * с нулём на одометре бывает (новый щиток), а сайт всё равно сверит с прошлым.
 */
export function parseOdometer(raw: string): { ok: true; km: number } | { ok: false; error: string } {
  const s = raw.replace(/[\s ]/g, "");
  if (s === "") return { ok: false, error: "Введите пробег — без него осмотра не бывает" };
  if (!/^\d+$/.test(s)) return { ok: false, error: "Пробег — целое число километров" };
  const km = Number(s);
  if (km > MAX_ODOMETER_KM) return { ok: false, error: `Пробег больше ${MAX_ODOMETER_KM.toLocaleString("ru-RU")} км — проверьте число` };
  return { ok: true, km };
}

/** «187 000 км». */
export function kmLabel(km: number): string {
  return `${Math.round(km).toLocaleString("ru-RU")} км`;
}

/** Больше четырёх кадров на дефект не бывает — и в шторке, и в отчёте. */
export const MAX_PHOTOS = 4;

/**
 * Идентификаторы фото из формы: только похожие на идентификаторы строки, без
 * повторов и не больше четырёх. Всё лишнее молча отбрасываем — это скрытые
 * поля, человек их не видел и исправить не может.
 */
export function photoIdsFrom(values: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || !/^[\w.-]{1,128}$/.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length === MAX_PHOTOS) break;
  }
  return out;
}

/** Работа «своими словами» без строки прайса: цену согласует админ. */
export const NEGOTIABLE_WORK = "Цену согласует админ";

/**
 * Чипы работ под своей формулировкой: работы из каталога узла (они уже
 * строки прайса — с ценой) и «цену согласует админ». Одну работу не
 * повторяем, даже если она стоит за двумя формулировками.
 */
export function customWorks(presets: readonly { work: string; price: number | null }[], limit = 3): { work: string; price: number | null }[] {
  const out: { work: string; price: number | null }[] = [];
  for (const p of presets) {
    if (!p.work || out.some(w => w.work === p.work)) continue;
    out.push({ work: p.work, price: p.price });
    if (out.length === limit) break;
  }
  out.push({ work: NEGOTIABLE_WORK, price: null });
  return out;
}
