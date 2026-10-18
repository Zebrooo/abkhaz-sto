// Правила экрана «Клиенты» магазина: виды по вертикали, строка под именем,
// пилюли сегментов и разбор дат заметки. База клиентов собирается на сайте
// из заказов по телефону (контракт goods §5), здесь — только как показать и
// как прочитать то, что владелец набрал в шторке. Чисто, под тестом.
import type { GoodsClientDate, GoodsClientOut, GoodsClientView, GoodsVertical } from "@/lib/api/goods";
import { agoLabel, count, dayShort, rub } from "@/lib/format";
import type { PillSpec } from "@/lib/goods/orders";
import { localDay } from "@/lib/sto/slots";

export const CLIENT_VIEW_LABEL: Record<GoodsClientView, string> = {
  all: "Все", regular: "Постоянные", holidays: "Праздники скоро", dormant: "Давно не брали", warranty: "Гарантия кончается",
};

/**
 * Чипы по вертикали (артборд «Клиенты»): цветам — праздники, электронике
 * вместо них — гарантия. Остальные виды общие.
 */
export function clientViews(vertical: GoodsVertical): GoodsClientView[] {
  return vertical === "electronics" ? ["all", "regular", "warranty", "dormant"] : ["all", "regular", "holidays", "dormant"];
}

/** «2 заказа · 17 400 ₽ · последний сегодня» / «… · последний 4 месяца назад». */
export function clientLine(c: GoodsClientOut, now: Date = new Date()): string {
  const ago = agoLabel(c.lastAt, now);
  const last = ago === "сегодня" || ago === "вчера" || ago === "впереди" ? ago : `${ago} назад`;
  return `${count(c.ordersCount, "заказ", "заказа", "заказов")} · ${rub(c.totalClosed)} · последний ${last}`;
}

/** «19.10» из «MM-DD» — год не хранится, дата повторяется каждый год. */
export function dayLabelMMDD(day: string): string {
  const [mm, dd] = day.split("-");
  return `${dd}.${mm}`;
}

/** Пилюли карточки: ближайшая дата, постоянный, давно без заказов, гарантия. */
export function clientPills(c: GoodsClientOut): PillSpec[] {
  const out: PillSpec[] = [];
  if (c.nextDate) out.push({ text: `${c.nextDate.label} · ${dayLabelMMDD(c.nextDate.day)}`, tone: c.nextDate.inDays <= 14 ? "warn" : "neu" });
  if (c.segments.includes("regular")) out.push({ text: "постоянный", tone: "ok" });
  if (c.segments.includes("dormant")) out.push({ text: "давно без заказов", tone: "neu" });
  if (c.segments.includes("warranty_ending") && c.warrantyEndsAt) {
    out.push({ text: `гарантия до ${dayShort(localDay(new Date(c.warrantyEndsAt)))}`, tone: "dng" });
  }
  return out;
}

/** Больше дат в одной заметке сайт не примет (контракт §5). */
export const MAX_CLIENT_DATES = 20;
const LABEL_MAX = 60;
const UPGRADE = /^апгрейд\s*[:—-]?\s*/i;

/**
 * Даты из текста шторки — по строке на дату: «19.10 день рождения мамы».
 * Электронике — «01.12 апгрейд: предложить ноут» (пометка вида
 * upgrade_offered, контракт §1). Год не пишут: дата повторяется ежегодно.
 */
export function parseClientDates(text: string): { ok: true; dates: GoodsClientDate[] } | { ok: false; error: string } {
  const dates: GoodsClientDate[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = /^(\d{1,2})\.(\d{1,2})\s+(.+)$/.exec(line);
    const dd = m ? Number(m[1]) : 0;
    const mm = m ? Number(m[2]) : 0;
    if (!m || dd < 1 || dd > 31 || mm < 1 || mm > 12) {
      return { ok: false, error: `Строка ${i + 1}: нужно «ДД.ММ подпись», например «19.10 день рождения мамы»` };
    }
    let label = m[3].trim();
    let kind: GoodsClientDate["kind"] = "holiday";
    if (UPGRADE.test(label)) {
      kind = "upgrade_offered";
      label = label.replace(UPGRADE, "").trim() || "предлагали апгрейд";
    }
    dates.push({ label: label.slice(0, LABEL_MAX), day: `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, kind });
    if (dates.length > MAX_CLIENT_DATES) return { ok: false, error: `Не больше ${MAX_CLIENT_DATES} дат на клиента` };
  }
  return { ok: true, dates };
}

/** Обратно в текст шторки — тем же видом, что разбирает parseClientDates. */
export function formatClientDates(dates: readonly GoodsClientDate[]): string {
  return dates.map(d => `${dayLabelMMDD(d.day)} ${d.kind === "upgrade_offered" ? "апгрейд: " : ""}${d.label}`).join("\n");
}

/** Поиск по имени, телефону и заметке. */
export function matchGoodsClient(c: GoodsClientOut, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const d = needle.replace(/\D+/g, "");
  if (d && c.phone.replace(/\D+/g, "").includes(d)) return true;
  return `${c.name} ${c.note}`.toLowerCase().includes(needle);
}
