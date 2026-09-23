// Оценка окна для записи ВОПРЕКИ правилам — приложенческая половина попапа
// «записать всё равно?». isSlotFree (sto/slots.ts, копия сайта) отвечает
// да/нет и этим закрывает виджет сайта; здесь тот же расчёт разложен на
// причины: прошло, вне часов, занято, впритык — чтобы показать их человеку
// и дать подтвердить. Правила пересечения и буфера обязаны совпадать с
// postTaken из slots.ts, иначе попап и сетка разойдутся в показаниях.
//
// «Прошло» считается от самого «сейчас», БЕЗ часа форы (DEFAULT_LEAD_MIN):
// фора — правило клиентской записи с сайта, а за стойкой «через полчаса» —
// не прошлое. Фора остаётся только фильтром списка свободных окон.
import type { StoSchedule } from "@/lib/sto/schedule";
import { toMinutes } from "@/lib/sto/schedule";
import { dayOfWeek, localDay, localHHMM, localTime, type BusyInterval } from "@/lib/sto/slots";

export type SlotWarning = "past" | "closed" | "taken" | "buffer";

export const SLOT_WARNING_LABEL: Record<SlotWarning, string> = {
  past: "Это время уже прошло",
  closed: "Сервис в это время не принимает",
  taken: "Время накладывается на другую запись",
  buffer: "Впритык к другой записи — без буфера между ними",
};

export type SlotAssessment = {
  /** Куда встанет запись: заданный пост или наименее занятый. */
  postNo: number;
  warnings: SlotWarning[];
  /** Записи, с которыми окно не разошлось (на выбранном посту) — для текста попапа. */
  conflicts: BusyInterval[];
};

/** Пересечения окна с записями поста: жёсткие и «только по буферу» — как postTaken в slots.ts. */
function clashes(busy: readonly BusyInterval[], postNo: number, startsAt: Date, endsAt: Date, bufferMin: number) {
  const pad = (Number.isFinite(bufferMin) && bufferMin > 0 ? bufferMin : 0) * 60_000;
  const on = busy.filter(b => b.postNo === postNo);
  const hard = on.filter(b => startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < endsAt.getTime());
  const soft = on.filter(b => startsAt.getTime() < b.endsAt.getTime() + pad && b.startsAt.getTime() < endsAt.getTime() + pad);
  return { hard, soft };
}

export function assessSlot(input: {
  schedule: StoSchedule;
  startsAt: Date;
  durationMin: number;
  busy: readonly BusyInterval[];
  /** Пост выбран человеком; без него — наименее занятый. */
  postNo?: number;
  now: Date;
}): SlotAssessment {
  const { schedule, startsAt, durationMin, busy, now } = input;
  const warnings: SlotWarning[] = [];
  if (startsAt < now) warnings.push("past");

  const day = localDay(startsAt);
  const startMin = toMinutes(localHHMM(startsAt));
  const inside = (schedule.days[dayOfWeek(day)] ?? []).some(it => startMin >= toMinutes(it.from) && startMin + durationMin <= toMinutes(it.to));
  if (schedule.daysOff.includes(day) || !inside) warnings.push("closed");

  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  const posts = Number.isInteger(schedule.posts) && schedule.posts > 0 ? schedule.posts : 1;
  const perPost = Array.from({ length: posts }, (_, i) => ({ postNo: i + 1, ...clashes(busy, i + 1, startsAt, endsAt, schedule.bufferMin) }));
  // Заданный пост — он и только он; свой выбор: чистый → без буфера →
  // наименее наложенный (при равенстве — меньший номер: sort стабильный).
  const chosen = input.postNo != null
    ? { postNo: input.postNo, ...clashes(busy, input.postNo, startsAt, endsAt, schedule.bufferMin) }
    : perPost.find(p => p.soft.length === 0)
      ?? perPost.find(p => p.hard.length === 0)
      ?? [...perPost].sort((a, b) => a.hard.length - b.hard.length)[0];
  if (chosen.hard.length > 0) warnings.push("taken");
  else if (chosen.soft.length > 0) warnings.push("buffer");
  return { postNo: chosen.postNo, warnings, conflicts: chosen.soft };
}

export type SlotOption = { hhmm: string; postNo: number; warnings: SlotWarning[] };

/**
 * ВСЕ узлы сетки дня — и свободные, и с предупреждениями: чипы формы записи
 * показывают занятое и прошедшее серым, а не прячут. Узлы идут по шагу от
 * начала каждого интервала приёма до его конца; хвост, куда услуга уже не
 * влезает, остаётся с пометкой closed — спрятанный узел нельзя было бы
 * выбрать и подтвердить. В разовый выходной сетка строится по часам этого
 * дня недели (все узлы closed); день недели без часов — без сетки вовсе.
 */
export function daySlotOptions(input: {
  schedule: StoSchedule;
  day: string;
  durationMin: number;
  busy: readonly BusyInterval[];
  postNo?: number;
  now: Date;
}): SlotOption[] {
  const { schedule, day } = input;
  // Та же страховка, что в freeSlots: цикл с шагом 0 вечный.
  if (!Number.isInteger(schedule.stepMin) || schedule.stepMin <= 0) return [];
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) return [];
  const out: SlotOption[] = [];
  for (const it of schedule.days[dayOfWeek(day)] ?? []) {
    for (let t = toMinutes(it.from); t < toMinutes(it.to); t += schedule.stepMin) {
      const hhmm = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      const { postNo, warnings } = assessSlot({ ...input, startsAt: localTime(day, hhmm) });
      out.push({ hhmm, postNo, warnings });
    }
  }
  out.sort((a, b) => (a.hhmm < b.hhmm ? -1 : 1));
  return out.filter((s, i) => i === 0 || s.hhmm !== out[i - 1].hhmm);
}
