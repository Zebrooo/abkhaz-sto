// Перетаскивание записи мышью и пальцем — чистые правила проверки. Здесь
// нет ни базы, ни DOM: компоненты спрашивают «что будет, если бросить сюда»,
// получают готовое окно и список записей, с которыми оно не разошлось, и
// красят их красным. Тем же ответом проверяется бросок (drag.test.ts).
//
// Правила обязаны совпадать с тем, что потом скажет сервер (slots.ts:
// isSlotFree через rescheduleBooking), иначе сетка разрешает бросок, а
// форма отвечает «занято»:
//  - занятыми считаются только живые записи (canReschedule) — выполненная
//    и отменённая пост не держат, и сервер их тоже не считает;
//  - буфер сервиса (schedule.bufferMin) держит пост после записи и нужен
//    перед следующей — с обеих сторон, как в postTaken;
//  - окно целиком лежит внутри интервала приёма: «через обед» нельзя;
//  - прошедшее время — предупреждение (past), а не запрет: перенос задним
//    числом сервис подтверждает попапом, и rescheduleBooking его пускает
//    с force.
import type { StoBookingRow } from "@/lib/sto/types";
import type { StoInterval } from "@/lib/sto/schedule";
import { toMinutes } from "@/lib/sto/schedule";
import { localHHMM } from "@/lib/sto/slots";
import { canReschedule } from "@/lib/sto/transitions";

/** Запись на сетке в минутах дня — всё, что нужно правилам. */
export type DragBlock = { id: number; postNo: number; fromMin: number; toMin: number; title: string };

/** «ЧЧ:ММ» минуты дня. */
export const hhmmOf = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;

/** Минута дня по часам сервиса. */
export function minutesOf(at: string | Date): number {
  const [h, m] = localHHMM(new Date(at)).split(":");
  return Number(h) * 60 + Number(m);
}

export function toDragBlock(b: StoBookingRow): DragBlock {
  return { id: b.id, postNo: b.post_no, fromMin: minutesOf(b.starts_at), toMin: minutesOf(b.ends_at), title: b.service.title };
}

/** Записи, которые держат пост: живые (новая и подтверждённая), как у сервера. */
export function busyBlocks(rows: readonly StoBookingRow[]): DragBlock[] {
  return rows.filter(b => canReschedule(b.status)).map(toDragBlock);
}

/** closed — вне часов приёма (перерыв, выходной, край смены); overlap — время наложилось на запись; buffer — между записями не осталось буфера; past — время уже прошло. */
export type DropReason = "closed" | "overlap" | "buffer" | "past";

export type DropResult = {
  postNo: number;
  /** Куда встанет запись после притяжения к сетке. */
  fromMin: number;
  toMin: number;
  /** null — бросок пройдёт. */
  reason: DropReason | null;
  /** Записи, с которыми окно не разошлось: их подсвечиваем красным. */
  conflicts: number[];
};

type Span = { from: number; to: number };

const spansOf = (intervals: readonly StoInterval[]): Span[] =>
  intervals.map(i => ({ from: toMinutes(i.from), to: toMinutes(i.to) }))
    .filter(s => s.to > s.from)
    .sort((a, b) => a.from - b.from);

const grid = (min: number, base: number, step: number) => base + Math.round((min - base) / step) * step;

/**
 * Куда встанет запись, если бросить её на пост postNo около минуты minute
 * (минута — начало записи, курсор уже без захвата за середину блока).
 *
 * Притягиваем только к тем узлам сетки, куда запись правда встаёт целиком:
 * к узлу шага внутри интервала приёма, от начала интервала. Не встаёт
 * никуда (обед, выходной, конец смены ближе длительности) — окно остаётся
 * под курсором и красится красным, а не прыгает молча к ближайшему краю:
 * человек ждёт запись там, куда её вёл.
 */
export function dropAt(input: {
  intervals: readonly StoInterval[];
  stepMin: number;
  bufferMin: number;
  durationMin: number;
  postNo: number;
  minute: number;
  blocks: readonly DragBlock[];
  movingId: number;
  /** Минута дня, раньше которой время уже прошло; не задана — прошлое не считаем. */
  pastBefore?: number;
}): DropResult {
  const { postNo, minute, durationMin, blocks, movingId } = input;
  const step = Number.isInteger(input.stepMin) && input.stepMin > 0 ? input.stepMin : 30;
  const pad = Number.isFinite(input.bufferMin) && input.bufferMin > 0 ? input.bufferMin : 0;
  const spans = spansOf(input.intervals);
  const base = spans.length > 0 ? spans[0].from : 0;

  let fromMin = grid(minute, base, step);
  let closed = true;
  for (const s of spans) {
    const snapped = grid(minute, s.from, step);
    // Узел за краем интервала — не окно: ни «до открытия», ни «часовая
    // услуга в 17:50 при смене до 18:00».
    if (snapped < s.from || snapped + durationMin > s.to) continue;
    if (closed || Math.abs(snapped - minute) < Math.abs(fromMin - minute)) {
      fromMin = snapped;
      closed = false;
    }
  }

  const toMin = fromMin + durationMin;
  const others = blocks.filter(b => b.id !== movingId && b.postNo === postNo);
  const hard = others.filter(b => fromMin < b.toMin && b.fromMin < toMin);
  const soft = others.filter(b => fromMin < b.toMin + pad && b.fromMin < toMin + pad);
  const past = input.pastBefore != null && fromMin < input.pastBefore;
  const reason: DropReason | null = hard.length > 0 ? "overlap" : soft.length > 0 ? "buffer" : closed ? "closed" : past ? "past" : null;
  return { postNo, fromMin, toMin, reason, conflicts: soft.map(b => b.id) };
}

/** Подпись под курсором: почему бросить нельзя — или куда встанет запись. */
export function dropWarning(res: DropResult, blocks: readonly DragBlock[], bufferMin = 0): string {
  const clash = blocks.find(b => b.id === res.conflicts[0]);
  const where = clash ? `«${clash.title}» ${hhmmOf(clash.fromMin)}–${hhmmOf(clash.toMin)}` : "другой записью";
  switch (res.reason) {
    case "overlap":
      return `Занято: время накладывается на ${where}${res.conflicts.length > 1 ? ` и ещё ${res.conflicts.length - 1}` : ""}`;
    case "buffer":
      return `Впритык к ${where}: между записями нужен перерыв ${bufferMin} мин`;
    case "closed":
      return "Вне часов приёма — сюда записать нельзя";
    case "past":
      return "Это время уже прошло — перенести задним числом?";
    default:
      return `Перенести на ${hhmmOf(res.fromMin)}–${hhmmOf(res.toMin)}, пост ${res.postNo}`;
  }
}

/** off — сервис в этот день не работает; closed — время вне часов приёма; busy — все посты заняты; past — день или время уже прошли. */
export type DayDropReason = "off" | "closed" | "busy" | "past";

export type DayDropResult = {
  day: string;
  fromMin: number;
  toMin: number;
  /** Первый свободный пост; null — вставать некуда. */
  postNo: number | null;
  reason: DayDropReason | null;
  conflicts: number[];
};

/**
 * Перенос записи на другой день недели тем же временем — бросок на столбик
 * в календаре. Пост не выбирают: как и при переносе из формы, сервер берёт
 * первый свободный, поэтому здесь проверяется, что хоть один свободен.
 */
export function dayDropAt(input: {
  day: string;
  intervals: readonly StoInterval[];
  posts: number;
  bufferMin: number;
  fromMin: number;
  durationMin: number;
  blocks: readonly DragBlock[];
  movingId: number;
  /** Минута дня-цели, раньше которой время прошло; Infinity — день прошёл целиком. */
  pastBefore?: number;
}): DayDropResult {
  const { day, fromMin, durationMin, blocks, movingId } = input;
  const pad = Number.isFinite(input.bufferMin) && input.bufferMin > 0 ? input.bufferMin : 0;
  const posts = Number.isInteger(input.posts) && input.posts > 0 ? input.posts : 1;
  const toMin = fromMin + durationMin;
  const spans = spansOf(input.intervals);
  if (spans.length === 0) return { day, fromMin, toMin, postNo: null, reason: "off", conflicts: [] };
  if (!spans.some(s => fromMin >= s.from && toMin <= s.to)) {
    return { day, fromMin, toMin, postNo: null, reason: "closed", conflicts: [] };
  }
  const others = blocks.filter(b => b.id !== movingId);
  const past = input.pastBefore != null && fromMin < input.pastBefore;
  for (let p = 1; p <= posts; p++) {
    const taken = others.some(b => b.postNo === p && fromMin < b.toMin + pad && b.fromMin < toMin + pad);
    if (!taken) return { day, fromMin, toMin, postNo: p, reason: past ? "past" : null, conflicts: [] };
  }
  const conflicts = others.filter(b => fromMin < b.toMin + pad && b.fromMin < toMin + pad).map(b => b.id);
  return { day, fromMin, toMin, postNo: null, reason: "busy", conflicts };
}

/**
 * Лесенка наложений: насколько блок сдвинуть вправо, чтобы записи,
 * положенные друг на друга (осознанное наложение), были видны и кликабельны.
 * Глубина — сколько записей того же поста «накрывают» начало блока, начавшись
 * не позже него; при одинаковом старте глубже та, что с большим id, — порядок
 * стабилен между рендерами.
 */
export function overlapDepth(blocks: readonly DragBlock[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const b of blocks) {
    const depth = blocks.filter(o => o.id !== b.id && o.postNo === b.postNo
      && o.toMin > b.fromMin
      && (o.fromMin < b.fromMin || (o.fromMin === b.fromMin && o.id < b.id))).length;
    map.set(b.id, depth);
  }
  return map;
}
