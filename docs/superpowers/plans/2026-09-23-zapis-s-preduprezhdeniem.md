# Запись с наложением и задним числом — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Четыре запрета записи (прошло, занято, впритык, вне часов) в приложении СТО становятся попапом-подтверждением; подтверждённое наложение пишется в базу с флагом `overlap_ok`, выводящим строку из exclude-констрейнта.

**Architecture:** Миграция в `abkhaz-auto` (колонка + констрейнт с `and not overlap_ok`). В приложении — новый чистый модуль `slot-warnings.ts` (оценка окна и выбор поста), силовой режим `force` в `createManualBooking`/`rescheduleBooking`, warn-редиректы в действиях, шторки подтверждения на форме записи и в переносе, клиентское подтверждение при перетаскивании, чипы «всех окон» и лесенка наложений в сетке.

**Tech Stack:** Next.js (App Router, серверные компоненты и действия), Supabase (postgres, supabase-js), Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-23-zapis-s-preduprezhdeniem-design.md`

## Global Constraints

- Ни одного коммита в `main` ни в одном репозитории; здесь работаем на уже созданной ветке `feat/zapis-s-preduprezhdeniem`, в `abkhaz-auto` — новая ветка `feat/sto-bookings-overlap-ok` от свежего `origin/main`.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; описания PR — строкой `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `src/lib/sto/*` (slots, schedule, types, transitions) — копии сайта, НЕ менять ни байта.
- Комментарии в коде — по-русски, объясняют «почему», в стиле репозитория; никаких обёрток ради одного значения.
- `overlap_ok` в `StoBookingRow` и в `COLUMNS` не добавляется — колонку никто не читает.
- Проверка перед PR: `pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build` (см. `.github/workflows/ci.yml` — джоба `checks` гоняет то же).
- Рабочая директория приложения: `/Users/dmitrii/projects/abkhaz-sto/.claude/worktrees/zen-keller-f1bea1`; репозиторий сайта: `/Users/dmitrii/projects/abkhaz-auto`.
- Порядок мержа строгий: PR с миграцией в `abkhaz-auto` мержится и накатывается ПЕРВЫМ, иначе force-путь с настоящим наложением падает по 23P01, а insert с колонкой `overlap_ok` — по «column does not exist».

---

### Task 1: Миграция в abkhaz-auto — колонка overlap_ok и ослабленный констрейнт

**Files:**
- Create: `/Users/dmitrii/projects/abkhaz-auto/supabase/migrations/20260923090000_sto_bookings_overlap_ok.sql`

**Interfaces:**
- Produces: колонка `public.sto_bookings.overlap_ok boolean not null default false`; констрейнт `sto_bookings_no_overlap` действует только `where (status in ('new','confirmed') and not overlap_ok)`. На неё опираются Task 3 (insert/update с `overlap_ok`).

- [ ] **Step 1: Задача в abkhaz-auto**

```bash
cd /Users/dmitrii/projects/abkhaz-auto && gh issue create \
  --title "СТО: осознанное наложение записей — колонка overlap_ok в sto_bookings" \
  --body "Приложение сервиса даёт админу/хозяину/мастеру записать клиента поверх занятого окна или задним числом — через попап-предупреждение (спека в abkhaz-sto: docs/superpowers/specs/2026-09-23-zapis-s-preduprezhdeniem-design.md). Подтверждённая запись помечается overlap_ok и выходит из ограничения исключения; обычный путь (виджет сайта) остаётся под защитой от гонки.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Запомнить номер задачи — он идёт в PR.

- [ ] **Step 2: Ветка от свежего main**

```bash
cd /Users/dmitrii/projects/abkhaz-auto && git fetch origin main && git checkout -b feat/sto-bookings-overlap-ok origin/main
```

Если в checkout мешают локальные изменения — остановиться и спросить пользователя, не трогать чужое.

- [ ] **Step 3: Написать миграцию**

Файл `supabase/migrations/20260923090000_sto_bookings_overlap_ok.sql`:

```sql
-- Наложение записей — только осознанно из приложения сервиса: человек за
-- стойкой видит «окно занято / время прошло — записать всё равно?» и
-- подтверждает. Такая запись помечается overlap_ok и выходит из ограничения
-- исключения: её можно положить поверх другой, и на неё можно наложиться.
-- Обычный путь (виджет сайта, запись без предупреждения) остаётся под
-- ограничением — гонку двух клиентов за последнее окно по-прежнему
-- разбивает база, а не код. Сайт колонку не трогает: default закрывает
-- все его вставки.
alter table public.sto_bookings
  add column if not exists overlap_ok boolean not null default false;

alter table public.sto_bookings
  drop constraint if exists sto_bookings_no_overlap;
alter table public.sto_bookings
  add constraint sto_bookings_no_overlap
  exclude using gist (
    shop_id with =,
    post_no with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('new', 'confirmed') and not overlap_ok);
```

- [ ] **Step 4: Проверить, что миграция не конфликтует по имени и порядку**

```bash
ls /Users/dmitrii/projects/abkhaz-auto/supabase/migrations | tail -5
```

Ожидание: новый файл — последний по имени (даты позже `20260922090000_...`).

- [ ] **Step 5: Коммит и PR**

```bash
cd /Users/dmitrii/projects/abkhaz-auto && git add supabase/migrations/20260923090000_sto_bookings_overlap_ok.sql && git commit -m "feat(сто): осознанное наложение записей — overlap_ok выводит строку из констрейнта

Приложение сервиса даст записать поверх занятого окна через попап;
подтверждённая запись помечается overlap_ok и не участвует в
sto_bookings_no_overlap. Обычные записи (сайт) — под защитой как раньше.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push -u origin feat/sto-bookings-overlap-ok
```

Открыть PR (`gh pr create`), в теле: ссылка на задачу из шага 1, объяснение «зачем» из коммита, пометка, что код сайта не меняется, и что PR приложения в abkhaz-sto зависит от наката этой миграции. Закончить тело строкой `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Мерж — после зелёного `checks`; накат миграции — как принято у владельца (не наша часть).

---

### Task 2: Чистый модуль slot-warnings — оценка окна и сетка чипов

**Files:**
- Create: `src/lib/slot-warnings.ts`
- Test: `src/lib/slot-warnings.test.ts`

**Interfaces:**
- Consumes: `StoSchedule` (`@/lib/sto/schedule`), `BusyInterval`, `dayOfWeek`, `localDay`, `localHHMM`, `localTime` (`@/lib/sto/slots`), `toMinutes` (`@/lib/sto/schedule`).
- Produces (их используют Task 3–7):

```ts
export type SlotWarning = "past" | "closed" | "taken" | "buffer";
export const SLOT_WARNING_LABEL: Record<SlotWarning, string>;
export type SlotAssessment = { postNo: number; warnings: SlotWarning[]; conflicts: BusyInterval[] };
export function assessSlot(input: {
  schedule: StoSchedule; startsAt: Date; durationMin: number;
  busy: readonly BusyInterval[]; postNo?: number; now: Date;
}): SlotAssessment;
export type SlotOption = { hhmm: string; postNo: number; warnings: SlotWarning[] };
export function daySlotOptions(input: {
  schedule: StoSchedule; day: string; durationMin: number;
  busy: readonly BusyInterval[]; postNo?: number; now: Date;
}): SlotOption[];
```

- [ ] **Step 1: Написать падающие тесты**

Файл `src/lib/slot-warnings.test.ts` (стиль — как `src/lib/drag.test.ts`: фабрики-хелперы, русские названия):

```ts
import { describe, expect, it } from "vitest";
import { assessSlot, daySlotOptions, SLOT_WARNING_LABEL } from "@/lib/slot-warnings";
import { localTime, type BusyInterval } from "@/lib/sto/slots";
import type { StoSchedule } from "@/lib/sto/schedule";

const DAY = "2026-09-23"; // среда
const SCHEDULE: StoSchedule = {
  days: {
    mon: [{ from: "09:00", to: "18:00" }], tue: [{ from: "09:00", to: "18:00" }],
    wed: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    thu: [{ from: "09:00", to: "18:00" }], fri: [{ from: "09:00", to: "18:00" }],
    sat: [], sun: [],
  },
  posts: 2, stepMin: 30, bufferMin: 0, daysOff: [],
};
const busy = (postNo: number, from: string, to: string): BusyInterval =>
  ({ postNo, startsAt: localTime(DAY, from), endsAt: localTime(DAY, to) });
const NOON = localTime(DAY, "12:00");
const assess = (hhmm: string, over: Partial<Parameters<typeof assessSlot>[0]> = {}) => assessSlot({
  schedule: SCHEDULE, startsAt: localTime(DAY, hhmm), durationMin: 60, busy: [], now: NOON, ...over,
});

describe("assessSlot — причины", () => {
  it("свободное окно в будущем — без предупреждений, первый пост", () => {
    expect(assess("15:00")).toMatchObject({ postNo: 1, warnings: [] });
  });

  it("прошедшее время — past, БЕЗ часа форы: через полчаса — не «прошло»", () => {
    expect(assess("11:00").warnings).toContain("past");
    expect(assess("12:30").warnings).toEqual([]);
  });

  it("вне часов приёма: до открытия, через обед, выходной день недели, разовый выходной", () => {
    expect(assess("08:00").warnings).toContain("closed");
    expect(assess("12:30", { durationMin: 90 }).warnings).toContain("closed");
    expect(assessSlot({ schedule: SCHEDULE, startsAt: localTime("2026-09-26", "10:00"), durationMin: 60, busy: [], now: NOON }).warnings).toContain("closed");
    expect(assess("15:00", { schedule: { ...SCHEDULE, daysOff: [DAY] } }).warnings).toContain("closed");
  });

  it("заданный пост занят — taken и виновник в conflicts", () => {
    const b = [busy(1, "15:00", "16:00")];
    const res = assess("15:30", { busy: b, postNo: 1 });
    expect(res.warnings).toContain("taken");
    expect(res.postNo).toBe(1);
    expect(res.conflicts).toEqual([b[0]]);
  });

  it("заданный пост впритык без буфера — buffer, не taken", () => {
    const res = assess("16:00", { busy: [busy(1, "15:00", "16:00")], postNo: 1, schedule: { ...SCHEDULE, bufferMin: 15 } });
    expect(res.warnings).toEqual(["buffer"]);
  });

  it("стык встык без буфера — не пересечение", () => {
    expect(assess("16:00", { busy: [busy(1, "15:00", "16:00")], postNo: 1 }).warnings).toEqual([]);
  });

  it("несколько причин сразу: прошло и занято", () => {
    const w = assess("10:00", { busy: [busy(1, "10:00", "11:00")], postNo: 1 }).warnings;
    expect(w).toContain("past");
    expect(w).toContain("taken");
  });
});

describe("assessSlot — выбор поста без заданного", () => {
  it("первый занят — берёт второй, без предупреждений", () => {
    expect(assess("15:00", { busy: [busy(1, "15:00", "16:00")] })).toMatchObject({ postNo: 2, warnings: [] });
  });

  it("свободного с буфером нет, без буфера есть — этот пост и buffer", () => {
    const res = assess("16:00", {
      busy: [busy(1, "15:00", "16:00"), busy(2, "16:30", "17:30")],
      schedule: { ...SCHEDULE, bufferMin: 15 },
    });
    expect(res).toMatchObject({ postNo: 1, warnings: ["buffer"] });
  });

  it("все посты пересечены — пост с наименьшим числом наложений, при равенстве меньший номер", () => {
    const res = assess("15:00", {
      busy: [busy(1, "14:30", "15:30"), busy(1, "15:30", "16:30"), busy(2, "15:00", "16:00")],
    });
    expect(res.postNo).toBe(2);
    expect(res.warnings).toContain("taken");
    expect(res.conflicts.map(c => c.postNo)).toEqual([2]);
  });
});

describe("daySlotOptions — все узлы сетки дня", () => {
  it("узлы идут по шагу внутри интервалов, свободные — без предупреждений", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts[0]).toMatchObject({ hhmm: "09:00", warnings: [] });
    expect(opts.some(o => o.hhmm === "13:30")).toBe(false); // обед — узлов нет
    expect(opts.at(-1)!.hhmm).toBe("17:30"); // последний узел смены остаётся, хоть услуга и не влезает
  });

  it("хвост смены, куда услуга не влезает, помечен closed, а не спрятан", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts.find(o => o.hhmm === "17:30")!.warnings).toContain("closed");
    expect(opts.find(o => o.hhmm === "17:00")!.warnings).toEqual([]);
  });

  it("занятые и прошедшие узлы получают свои причины", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [busy(1, "15:00", "16:00"), busy(2, "15:00", "16:00")], now: NOON });
    expect(opts.find(o => o.hhmm === "15:00")!.warnings).toContain("taken");
    expect(opts.find(o => o.hhmm === "10:00")!.warnings).toContain("past");
  });

  it("заданный пост сужает оценку до него", () => {
    const opts = daySlotOptions({ schedule: SCHEDULE, day: DAY, durationMin: 60, busy: [busy(1, "15:00", "16:00")], now: NOON, postNo: 1 });
    expect(opts.find(o => o.hhmm === "15:00")).toMatchObject({ postNo: 1, warnings: ["taken"] });
  });

  it("разовый выходной — сетка по часам дня недели, все узлы closed", () => {
    const opts = daySlotOptions({ schedule: { ...SCHEDULE, daysOff: [DAY] }, day: DAY, durationMin: 60, busy: [], now: localTime(DAY, "00:00") });
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every(o => o.warnings.includes("closed"))).toBe(true);
  });

  it("день недели без часов приёма — узлов нет", () => {
    expect(daySlotOptions({ schedule: SCHEDULE, day: "2026-09-26", durationMin: 60, busy: [], now: NOON })).toEqual([]);
  });

  it("кривое расписание (шаг 0) — пусто, а не вечный цикл", () => {
    expect(daySlotOptions({ schedule: { ...SCHEDULE, stepMin: 0 }, day: DAY, durationMin: 60, busy: [], now: NOON })).toEqual([]);
  });
});

describe("подписи", () => {
  it("у каждой причины есть человеческий текст", () => {
    for (const w of ["past", "closed", "taken", "buffer"] as const) {
      expect(SLOT_WARNING_LABEL[w].length).toBeGreaterThan(3);
    }
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm vitest run src/lib/slot-warnings.test.ts`
Expected: FAIL — модуль `@/lib/slot-warnings` не существует.

- [ ] **Step 3: Реализация**

Файл `src/lib/slot-warnings.ts`:

```ts
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
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm vitest run src/lib/slot-warnings.test.ts`
Expected: PASS. Если падает выбор поста «наименее занятый» — проверить, что sort копирует массив (`[...perPost]`) и что conflicts берутся с выбранного поста.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/slot-warnings.ts src/lib/slot-warnings.test.ts && git commit -m "feat(запись): оценка окна по причинам — прошло, вне часов, занято, впритык

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Силовой режим в bookings.ts + докправка API-sushchnosti.md

**Files:**
- Modify: `src/lib/bookings.ts` (функции `createManualBooking`, `rescheduleBooking`)
- Modify: `docs/API-sushchnosti.md` (абзац про «единственную защиту от гонки»)

**Interfaces:**
- Consumes: `assessSlot`, `SLOT_WARNING_LABEL`, `SlotWarning` из Task 2.
- Produces (используют Task 4):

```ts
// createManualBooking: вход + { force?: boolean }; выход
{ ok: true; id: number } | { ok: false; error: string; warn?: SlotWarning[] }
// rescheduleBooking: вход + { force?: boolean }; выход
ActionResult | { ok: false; error: string; warn: SlotWarning[] }
// (ActionResult не меняется; warn добавляется в отказную ветку)
```

- [ ] **Step 1: createManualBooking — assessSlot вместо isSlotFree**

В `src/lib/bookings.ts`: импортировать `assessSlot`, `SLOT_WARNING_LABEL`, `type SlotWarning` из `@/lib/slot-warnings` (импорт `isSlotFree` из slots убрать, `firstFreePost`/`localTime` остаются — их использует walk-in). Тип результата и сигнатура:

```ts
export async function createManualBooking(input: {
  shopId: number; schedule: StoSchedule; day: string; hhmm: string; service: StoBookingService; listingId: number | null;
  client: { name: string; phone: string | null }; vehicle: string; comment: string; actorUserId: string;
  plate?: string | null; vin?: string | null;
  postNo?: number;
  /** Человек подтвердил попап «записать всё равно» — предупреждения не останавливают. */
  force?: boolean;
}): Promise<{ ok: true; id: number } | { ok: false; error: string; warn?: SlotWarning[] }> {
```

Вместо блока `const free = isSlotFree(...); if (!free.ok) { ... }`:

```ts
  // Пост за пределами расписания — не предупреждение, а бессмыслица: force
  // не создаёт постов, поэтому отказ остаётся жёстким.
  if (input.postNo != null && (!Number.isInteger(input.postNo) || input.postNo < 1 || input.postNo > schedule.posts)) {
    return { ok: false, error: "Такого поста у сервиса нет" };
  }
  const slot = assessSlot({ schedule, startsAt, durationMin: service.durationMin, busy, postNo: input.postNo, now: new Date() });
  if (!input.force && slot.warnings.length > 0) {
    return { ok: false, error: SLOT_WARNING_LABEL[slot.warnings[0]], warn: slot.warnings };
  }
```

В insert: `post_no: slot.postNo`, и в объект вставки добавить строку с комментарием:

```ts
    // Подтверждённое наложение выходит из констрейнта базы (overlap_ok);
    // запись без наложения остаётся под ним даже при force — иначе чистое
    // окно потеряло бы защиту от гонки с сайтом.
    overlap_ok: input.force === true && (slot.warnings.includes("taken") || slot.warnings.includes("buffer")),
```

- [ ] **Step 2: rescheduleBooking — то же самое**

Сигнатура: добавить `force?: boolean;` во вход, выход — `Promise<ActionResult | { ok: false; error: string; warn: SlotWarning[] }>`. Вместо `const free = isSlotFree(...); if (!free.ok) {...}`:

```ts
  if (input.postNo != null && (!Number.isInteger(input.postNo) || input.postNo < 1 || input.postNo > schedule.posts)) {
    return { ok: false, error: "Такого поста у сервиса нет" };
  }
  const slot = assessSlot({ schedule, startsAt, durationMin, busy, postNo: input.postNo, now: new Date() });
  if (!input.force && slot.warnings.length > 0) {
    return { ok: false, error: SLOT_WARNING_LABEL[slot.warnings[0]], warn: slot.warnings };
  }
```

В `.update({...})`: `post_no: slot.postNo` (вместо `free.postNo`) и добавить

```ts
      // Перенос в чистое окно возвращает запись под защиту базы, перенос в
      // наложение (по подтверждению) — выводит из неё.
      overlap_ok: input.force === true && (slot.warnings.includes("taken") || slot.warnings.includes("buffer")),
```

- [ ] **Step 3: Типы и тесты не сломаны**

Run: `pnpm exec tsc --noEmit && pnpm vitest run`
Expected: PASS. (`bookings.ts` под юнит-тестами напрямую не стоит — базовые пути проверяет tsc и существующие тесты соседних модулей.)

- [ ] **Step 4: Докправка**

В `docs/API-sushchnosti.md` абзац «Пост — физическое место…» дополнить одним предложением после «…жмут «Записать» одновременно.»:

```
Исключение — записи с `overlap_ok` (осознанное наложение из приложения,
подтверждённое попапом): они из ограничения выведены.
```

- [ ] **Step 5: Коммит**

```bash
git add src/lib/bookings.ts docs/API-sushchnosti.md && git commit -m "feat(запись): force-режим создания и переноса — предупреждения вместо отказа, overlap_ok в базу

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: actions.ts — warn-редиректы и force из формы

**Files:**
- Modify: `src/app/(app)/actions.ts` (функции `back`, `createManualAction`, `rescheduleAction`)

**Interfaces:**
- Consumes: `warn` в результатах из Task 3.
- Produces (используют Task 5–6): параметры адреса при предупреждении:
  - создание → `/kalendar/novaya?...&warn=past,taken&step=2` (+ typed-поля, включая новый `c=` комментария);
  - перенос → `<returnTo>?...&warn=...&wb=<bookingId>&wt=<hhmm>&wp=<postNo|пусто>`;
  - обе формы шлют `force=1` кнопкой `name="force" value="1"`.

- [ ] **Step 1: back() чистит warn-параметры**

В `back()` рядом с `sp.delete("ok"); sp.delete("err");` добавить:

```ts
  // Параметры предупреждения одноразовые, как ok/err: следующий переход не
  // должен снова открыть шторку «записать всё равно».
  for (const k of ["warn", "wb", "wt", "wp"]) sp.delete(k);
```

- [ ] **Step 2: createManualAction**

- После `const hhmm = str(fd, "hhmm");` добавить `const force = str(fd, "force") === "1";`.
- В `typed` добавить комментарий (он терялся при любом возврате, с попапом это стало бы массовым): `c: str(fd, "comment") || undefined,`.
- Вызов: `createManualBooking({ ..., force })`.
- Ветку отказа заменить на:

```ts
  if (!res.ok) {
    // Предупреждение — не ошибка: возвращаемся с warn, экран покажет шторку
    // «записать всё равно?», и та же форма уйдёт повторно с force=1.
    if (res.warn) back(ret, { ...keep, ...typed, step: "2", warn: res.warn.join(",") });
    back(ret, { ...keep, ...typed, step: "1", err: res.error });
  }
```

- [ ] **Step 3: rescheduleAction**

После чтения `postNo` добавить `const force = str(fd, "force") === "1";`, передать `force` в `rescheduleBooking`. Ветку отказа:

```ts
  if (!res.ok) {
    if ("warn" in res && res.warn) {
      // Контекст переноса едет в адресе: экран возврата соберёт из него
      // шторку подтверждения со своей маленькой формой.
      back(ret, { warn: res.warn.join(","), wb: String(Number(str(fd, "bookingId"))), wt: str(fd, "hhmm"), wp: postNo ? String(postNo) : null, d: day });
    }
    back(ret, { err: res.error });
  }
```

- [ ] **Step 4: Проверка типов**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add "src/app/(app)/actions.ts" && git commit -m "feat(запись): предупреждение уезжает в адрес (warn=), force=1 повторяет действие

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Форма «Новая запись» — чипы всех окон, прошлые дни, шторка подтверждения

**Files:**
- Modify: `src/app/(app)/kalendar/novaya/page.tsx`
- Modify: `src/app/globals.css` (стиль warn-чипа)

**Interfaces:**
- Consumes: `daySlotOptions`, `assessSlot`, `SLOT_WARNING_LABEL`, `SlotWarning` (Task 2); warn-параметр из Task 4; `Sheet` (`@/components/Sheet`).
- Produces: форма шлёт `force=1` кнопкой в шторке; textarea комментария получает `defaultValue` из `sp.c`.

- [ ] **Step 1: Чипы всех окон**

Заменить вычисление `slots` (блок `const slots = freeSlots({...}).map(...)`) на:

```ts
  // ВСЕ узлы сетки, а не только свободные: занятые, прошедшие и «впритык»
  // видны серыми и выбираются — записать вопреки им можно, подтвердив попап.
  // Свободным чип считается по freeSlots-правилам БЕЗ форы: за стойкой
  // «через полчаса» — обычное время, а не прошедшее.
  const slots = daySlotOptions({ schedule, day, durationMin: svc.durationMin, busy, postNo: postNo ?? undefined, now });
```

Импорты: `daySlotOptions, SLOT_WARNING_LABEL, assessSlot` из `@/lib/slot-warnings`; `freeSlots` из импорта slots убрать, `localHHMM`/`localTime` оставить. `chosen` остаётся `slots.find(s => s.hhmm === time) ?? null` — тип теперь `SlotOption`.

Рендер чипов (блок `<div className="slots">`):

```tsx
                    <div className="slots">
                      {slots.map(s => (
                        <Link
                          key={s.hhmm}
                          className={`slot${s.warnings.length > 0 ? " warn" : ""}`}
                          href={href({ t: s.hhmm })}
                          aria-pressed={s.hhmm === time}
                          title={s.warnings.length > 0 ? s.warnings.map(w => SLOT_WARNING_LABEL[w]).join("; ") : `пост ${s.postNo}`}
                        >
                          {s.hhmm}
                        </Link>
                      ))}
                    </div>
```

Подпись над списком «Свободные окна» сменить на «Окна дня» (свободные там больше не одни). Подсказку `slots.length === 0` оставить, текст: `В этот день у сервиса нет часов приёма — записать можно переносом из сетки.`

- [ ] **Step 2: Итоговая строка честно предупреждает**

После `const chosen = ...`:

```ts
  const chosenWarnings = chosen?.warnings ?? [];
  const when = chosen
    ? `${dayTitle(day)}, ${chosen.hhmm} · пост ${chosen.postNo} · ${minutesLabel(svc.durationMin)}${chosenWarnings.length > 0 ? " · ⚠ " + chosenWarnings.map(w => SLOT_WARNING_LABEL[w].toLowerCase()).join(", ") : ""}`
    : `${dayTitle(day)} · окно не выбрано · ${minutesLabel(svc.durationMin)}`;
```

(существующее объявление `when` заменить). Подсказку `time && !chosen` («не подходит — выберите другое») оставить: она теперь срабатывает только для времени, которого нет в сетке вовсе.

- [ ] **Step 3: Полоса дней и календарик пускают в прошлое**

В блоке полосы дней:
- `const paged = isDay(dsRaw) && dsRaw > today ? dsRaw : "";` → `const paged = isDay(dsRaw) ? dsRaw : "";`
- `const stripPrev = addDays(first, -7) > today ? addDays(first, -7) : today;` → `const stripPrev = addDays(first, -7);`
- условие стрелки «Раньше» `{first > today && (` → убрать условие, стрелка есть всегда (комментарий про пропадающую стрелку заменить на: `Назад листается и в прошлое: запись задним числом — законная, с попапом.`).
- `ds: stripPrev === today ? null : stripPrev` → `ds: stripPrev === today ? null : stripPrev` оставить как есть (сброс на today убирает параметр — поведение не ломается).

`DayPick` прошлые дни уже пускает — там ничего не менять.

- [ ] **Step 4: Шторка «Записать всё равно?»**

Импортировать `Sheet` из `@/components/Sheet`. Перед рендером прочитать warn:

```ts
  const warnRaw = pick(sp.warn);
  const warns = warnRaw ? (warnRaw.split(",").filter((w): w is SlotWarning => w === "past" || w === "closed" || w === "taken" || w === "buffer")) : [];
  // Детали конфликтов для текста шторки считаем на месте — в адресе они
  // не едут: заголовки чужих записей длинные и там им не место.
  const clash = warns.length > 0 && chosen && startsAt
    ? assessSlot({ schedule, startsAt, durationMin: svc.durationMin, busy, postNo: postNo ?? undefined, now }).conflicts
    : [];
```

(тип `SlotWarning` — в импорт из `@/lib/slot-warnings`). В `Over`/`href` добавить `warn?: null` со строкой `if (v.warn) q.set("warn", v.warn);` НЕ добавлять — наоборот: `href` warn не несёт, любая навигация его сбрасывает (это уже так — просто не включать warn в builder; для closeHref хватит `href({})`).

Внутри `<form ...>` перед `</form>` добавить:

```tsx
          {warns.length > 0 && chosen && (
            <Sheet closeHref={href({})} title="Записать всё равно?" sub={`${dayTitle(day)}, ${chosen.hhmm} · пост ${chosen.postNo}`} footer={
              <>
                <Link className="aui-btn aui-btn--outline aui-btn--md" href={href({})}>Выбрать другое время</Link>
                <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" name="force" value="1">Записать всё равно</button>
              </>
            }>
              {/* Причины — списком, наложения — с чужими записями поимённо:
                  человек подтверждает конкретное, а не абстрактное «нельзя». */}
              <ul className="warn-list">
                {warns.map(w => <li key={w}>{SLOT_WARNING_LABEL[w]}</li>)}
              </ul>
              {clash.length > 0 && (
                <p className="hint">
                  Пересечение: {clash.map(c => `${localHHMM(c.startsAt)}–${localHHMM(c.endsAt)} (пост ${c.postNo})`).join(", ")}
                </p>
              )}
            </Sheet>
          )}
```

- [ ] **Step 5: Комментарий переживает возврат**

`<textarea name="comment" ...>` получает `defaultValue={pick(sp.c)}`.

- [ ] **Step 6: Стили**

В `src/app/globals.css` после `.slot[aria-pressed="true"] {...}` добавить:

```css
/* Окно с предупреждением: выбрать можно, но чип честно серый и штрихованный. */
.slot.warn { color: var(--muted); border-style: dashed; background: var(--bg-2); }
.slot.warn[aria-pressed="true"] { background: var(--accent); color: #fff; border-style: solid; }
.warn-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
```

(если переменной `--bg-2` нет — взять фон, которым красится `.tl-past`, посмотрев его определение рядом.)

- [ ] **Step 7: Ручная проверка**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: PASS. Затем `pnpm dev` и глазами: `/kalendar/novaya` — чипы занятых серые, выбор занятого → «Записать» → шторка → «Записать всё равно» создаёт запись (до наката миграции настоящее наложение упадёт с «Окно только что заняли» из-за 23P01 — это ожидаемо, проверить хотя бы past-путь на свободном посту).

- [ ] **Step 8: Коммит**

```bash
git add "src/app/(app)/kalendar/novaya/page.tsx" src/app/globals.css && git commit -m "feat(запись): чипы всех окон, прошлые дни и шторка «записать всё равно?»

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Перенос — шторка подтверждения из адреса (kalendar, segodnya, карточка записи)

**Files:**
- Create: `src/components/MoveConfirm.tsx`
- Modify: `src/app/(app)/kalendar/page.tsx`
- Modify: `src/app/(app)/segodnya/page.tsx`
- Modify: `src/app/(app)/zapis/[id]/page.tsx`

**Interfaces:**
- Consumes: warn/wb/wt/wp из Task 4; `assessSlot`, `SLOT_WARNING_LABEL`, `SlotWarning` (Task 2); `Sheet`; `rescheduleAction`; `busyBlocks` не нужен — busy собирается как в `rescheduleBooking`.
- Produces:

```tsx
// Разбор warn-параметров: null, если их нет или они кривые.
export function moveWarnFromQuery(sp: Record<string, string | string[] | undefined>):
  { bookingId: number; hhmm: string; postNo?: number; warns: SlotWarning[] } | null;
// Шторка: маленькая форма rescheduleAction с force=1 внутри footer.
export function MoveConfirmSheet(props: {
  shopId: number; bookingId: number; day: string; hhmm: string; postNo?: number;
  warns: SlotWarning[]; conflicts: { at: string; postNo: number }[]; closeHref: string; returnTo: string;
}): JSX.Element;
```

- [ ] **Step 1: Компонент**

Файл `src/components/MoveConfirm.tsx`:

```tsx
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { SLOT_WARNING_LABEL, type SlotWarning } from "@/lib/slot-warnings";
import { rescheduleAction } from "@/app/(app)/actions";

/**
 * Шторка «перенести всё равно?». Сервер отказал переносу предупреждением и
 * вернул его контекст в адресе (warn, wb, wt, wp — action back()); экран
 * рисует шторку, и подтверждение уходит НОВОЙ маленькой формой с force=1 —
 * исходная форма переноса (сетка, список окон) к этому моменту уже умерла
 * вместе с навигацией.
 */
export function moveWarnFromQuery(sp: Record<string, string | string[] | undefined>) {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const warns = pick(sp.warn).split(",").filter((w): w is SlotWarning => w === "past" || w === "closed" || w === "taken" || w === "buffer");
  const bookingId = Number(pick(sp.wb));
  const hhmm = pick(sp.wt);
  const postRaw = Number(pick(sp.wp));
  if (warns.length === 0 || !Number.isInteger(bookingId) || bookingId <= 0 || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return { bookingId, hhmm, postNo: Number.isInteger(postRaw) && postRaw > 0 ? postRaw : undefined, warns };
}

export function MoveConfirmSheet({ shopId, bookingId, day, hhmm, postNo, warns, conflicts, closeHref, returnTo }: {
  shopId: number; bookingId: number; day: string; hhmm: string; postNo?: number;
  warns: SlotWarning[];
  /** «10:00–11:00 (пост 2)» — с кем пересекаемся, уже готовой строкой. */
  conflicts: { at: string; postNo: number }[];
  closeHref: string;
  returnTo: string;
}) {
  return (
    <Sheet closeHref={closeHref} title="Перенести всё равно?" sub={`${day}, ${hhmm}${postNo ? ` · пост ${postNo}` : ""}`} footer={
      <>
        <Link className="aui-btn aui-btn--outline aui-btn--md" href={closeHref}>Отмена</Link>
        <form action={rescheduleAction} style={{ display: "contents" }}>
          <input type="hidden" name="shopId" value={shopId} />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="hhmm" value={hhmm} />
          {postNo != null && <input type="hidden" name="postNo" value={postNo} />}
          <input type="hidden" name="return" value={returnTo} />
          <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" name="force" value="1">Перенести всё равно</button>
        </form>
      </>
    }>
      <ul className="warn-list">
        {warns.map(w => <li key={w}>{SLOT_WARNING_LABEL[w]}</li>)}
      </ul>
      {conflicts.length > 0 && (
        <p className="hint">Пересечение: {conflicts.map(c => `${c.at} (пост ${c.postNo})`).join(", ")}</p>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: kalendar/page.tsx — шторка + чипы всех окон в режиме переноса**

- Импорты: `moveWarnFromQuery, MoveConfirmSheet` из `@/components/MoveConfirm`; `assessSlot, daySlotOptions, SLOT_WARNING_LABEL` из `@/lib/slot-warnings`; `freeSlots` из импорта slots убрать (если больше не используется), `localTime` остаётся.
- `moveSlots`: заменить `freeSlots({...}).map(...)` на

```ts
    moveSlots = daySlotOptions({ schedule: shop.schedule, day, durationMin, busy, now: new Date() });
```

(тип `let moveSlots: SlotOption[] = []` — импортировать `type SlotOption`). Кнопки списка:

```tsx
                {moveSlots.map(s => (
                  <button key={s.hhmm} className={`slot${s.warnings.length > 0 ? " warn" : ""}`} type="submit" name="hhmm" value={s.hhmm}
                    title={s.warnings.length > 0 ? s.warnings.map(w => SLOT_WARNING_LABEL[w]).join("; ") : `пост ${s.postNo}`}>
                    {s.hhmm}
                  </button>
                ))}
```

Текст пустого списка `moveSlots.length === 0` — «В этот день у сервиса нет часов приёма.»
- Шторка (в конце JSX, перед `</CalendarDrag>` — рядом с `<aside>`): собрать busy дня так же, как для `moveSlots` (он уже есть в блоке `if (moving ...)` — вынести `busy` из блока выше, объявив `let dayBusy: BusyInterval[] = []` и заполняя внутри), затем:

```tsx
      {(() => {
        const mw = moveWarnFromQuery(sp);
        if (!mw || !shop.schedule || !moving || moving.id !== mw.bookingId) return null;
        const durationMin = Math.max(1, Math.round((new Date(moving.ends_at).getTime() - new Date(moving.starts_at).getTime()) / 60_000));
        const res = assessSlot({ schedule: shop.schedule, startsAt: localTime(day, mw.hhmm), durationMin, busy: dayBusy, postNo: mw.postNo, now });
        return (
          <MoveConfirmSheet
            shopId={shop.id} bookingId={mw.bookingId} day={day} hhmm={mw.hhmm} postNo={mw.postNo}
            warns={mw.warns}
            conflicts={res.conflicts.map(c => ({ at: `${localHHMM(c.startsAt)}–${localHHMM(c.endsAt)}`, postNo: c.postNo }))}
            closeHref={href(day, filter, moving.id)}
            returnTo={returnTo}
          />
        );
      })()}
```

(`localHHMM` уже в импортах; `BusyInterval` — добавить `type BusyInterval` к импорту из slots.)

- [ ] **Step 3: segodnya/page.tsx и zapis/[id]/page.tsx — та же шторка**

Оба экрана рендерят `Timeline`; при гонке (сетка считала окно свободным, сервер нашёл предупреждение) rescheduleAction вернёт warn-параметры на их адрес. В каждом:
- прочитать `sp` (уже читается), схему и записи дня (уже есть: `live`/`dayRows` + расписание);
- перед закрывающим тегом страницы добавить тот же блок, что в Step 2, с местными данными: `moving` заменить на поиск записи в строках дня (`rows.find(r => r.id === mw.bookingId)`), busy собрать из строк дня фильтром `canReschedule(r.status) && r.id !== mw.bookingId` (как в `kalendar`), `closeHref` — текущий адрес экрана без warn-параметров (собрать руками: у segodnya `/segodnya?d=${day}`, у карточки `/zapis/${b.id}?d=${day}`), `returnTo` — тот же, что уже передаётся в `Timeline`.
- Если запись по `wb` в строках дня не нашлась (день другой) — шторку не рисовать: `return null` уже это делает.

- [ ] **Step 4: Проверка**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: PASS. Руками: `/kalendar?d=<день>&move=<id>` — чипы занятых серые, клик → шторка «Перенести всё равно?», подтверждение переносит (past-путь), отмена возвращает без параметров.

- [ ] **Step 5: Коммит**

```bash
git add src/components/MoveConfirm.tsx "src/app/(app)/kalendar/page.tsx" "src/app/(app)/segodnya/page.tsx" "src/app/(app)/zapis/[id]/page.tsx" && git commit -m "feat(перенос): все окна чипами и шторка «перенести всё равно?» из адреса

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: drag.ts — причина past и глубина наложения

**Files:**
- Modify: `src/lib/drag.ts`
- Test: `src/lib/drag.test.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces (используют Task 8):

```ts
export type DropReason = "closed" | "overlap" | "buffer" | "past";
// dropAt input + { pastBefore?: number }  — минута дня, раньше которой время прошло
// dayDropAt input + { pastBefore?: number } — то же для дня-цели (Infinity для целиком прошедшего дня)
export type DayDropReason = "off" | "closed" | "busy" | "past";
export function overlapDepth(blocks: readonly DragBlock[]): Map<number, number>;
```

Приоритет причин не меняется для существующих; `past` — последняя (структурные важнее): overlap > buffer > closed > past; для дня: off > closed > busy > past.

- [ ] **Step 1: Падающие тесты**

Добавить в `src/lib/drag.test.ts`:

```ts
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
});

describe("dayDropAt — прошедший день", () => {
  const day = (over: Partial<Parameters<typeof dayDropAt>[0]> = {}) => dayDropAt({
    day: "2026-09-17", intervals: DAY, posts: 2, bufferMin: 0, fromMin: 10 * 60, durationMin: 60,
    blocks: [], movingId: 1, ...over,
  });

  it("день целиком прошёл — past, но пост найден", () => {
    expect(day({ pastBefore: Infinity })).toMatchObject({ postNo: 1, reason: "past" });
  });

  it("занятость важнее прошедшего", () => {
    const res = day({ pastBefore: Infinity, blocks: [block(2, 1, "10:00", "11:00"), block(3, 2, "09:30", "10:30")] });
    expect(res.reason).toBe("busy");
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
```

`overlapDepth` добавить в импорт из `@/lib/drag`.

- [ ] **Step 2: Тесты падают**

Run: `pnpm vitest run src/lib/drag.test.ts`
Expected: FAIL (нет `overlapDepth`, нет `pastBefore`).

- [ ] **Step 3: Реализация**

В `src/lib/drag.ts`:
- `export type DropReason = "closed" | "overlap" | "buffer" | "past";`
- `dropAt`: во вход добавить `/** Минута дня, раньше которой время уже прошло; не задана — прошлое не считаем. */ pastBefore?: number;`. Строку `const reason ...` заменить:

```ts
  const past = input.pastBefore != null && fromMin < input.pastBefore;
  const reason: DropReason | null = hard.length > 0 ? "overlap" : soft.length > 0 ? "buffer" : closed ? "closed" : past ? "past" : null;
```

- Шапочный комментарий модуля: строку «прошедшее время НЕ отсекаем…» заменить на «прошедшее время — предупреждение (past), а не запрет: перенос задним числом сервис подтверждает попапом».
- `dropWarning`: добавить case

```ts
    case "past":
      return "Это время уже прошло — перенести задним числом?";
```

- `export type DayDropReason = "off" | "closed" | "busy" | "past";`
- `dayDropAt`: во вход `pastBefore?: number;`; в ветке успеха (`if (!taken) return ...`) вместо `reason: null`:

```ts
    if (!taken) {
      const past = input.pastBefore != null && fromMin < input.pastBefore;
      return { day, fromMin, toMin, postNo: p, reason: past ? "past" : null, conflicts: [] };
    }
```

- `overlapDepth`:

```ts
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
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm vitest run src/lib/drag.test.ts`
Expected: PASS (в том числе старые: «без pastBefore прошлое не считается»).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/drag.ts src/lib/drag.test.ts && git commit -m "feat(сетка): причина past при броске и глубина наложения для лесенки

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Timeline и CalendarDrag — подтверждение на месте, лесенка

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/CalendarDrag.tsx`
- Modify: `src/app/globals.css` (кнопка-скрим)

**Interfaces:**
- Consumes: `pastBefore`, `overlapDepth`, `dropWarning`, расширенные причины из Task 7; `rescheduleAction` принимает `force` (Task 4).
- Produces: обе скрытые формы получают `<input type="hidden" name="force" ...>`, состояние move расширяется полем `force: boolean`.

- [ ] **Step 1: Timeline — бросок с причиной ведёт в подтверждение**

- В вызов `dropAt` добавить `pastBefore: nowMin ?? (dayPassed ? Number.POSITIVE_INFINITY : undefined),`.
- Состояние: `const [move, setMove] = useState<{ bookingId: number; hhmm: string; postNo: number; force: boolean } | null>(null);` и новое `const [ask, setAsk] = useState<{ bookingId: number; hhmm: string; postNo: number; text: string } | null>(null);`
- `onUp`: заменить блок

```ts
    const done = drag.moved ? res : null;
    setDrag(null);
    if (!done) return;
    const row = rows.find(r => r.id === drag.id);
    if (row && done.postNo === row.post_no && done.fromMin === minutesOf(row.starts_at)) return;
    if (done.reason) {
      // Бросок «нельзя» больше не умирает молча: показываем, почему, и даём
      // подтвердить — перенос вопреки правилам делается осознанно.
      setAsk({ bookingId: drag.id, hhmm: hhmmOf(done.fromMin), postNo: done.postNo, text: dropWarning(done, blocks, rules.bufferMin) });
      return;
    }
    setMove({ bookingId: drag.id, hhmm: hhmmOf(done.fromMin), postNo: done.postNo, force: false });
```

- Диалог подтверждения (рядом с `tl-warn`, вне `.tl`):

```tsx
      {ask && (
        <>
          <button className="scrim" onClick={() => setAsk(null)} aria-label="Отмена" />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tl-ask-t">
            <div className="sheet-grip"><span /></div>
            <div className="sheet-head">
              <div className="h-mid"><div className="h-title" id="tl-ask-t">Перенести всё равно?</div></div>
            </div>
            <div className="sheet-body"><p>{ask.text}</p></div>
            <div className="sheet-foot">
              <button className="aui-btn aui-btn--outline aui-btn--md" type="button" onClick={() => setAsk(null)}>Отмена</button>
              <button className="aui-btn aui-btn--primary aui-btn--lg" type="button"
                onClick={() => { setMove({ bookingId: ask.bookingId, hhmm: ask.hhmm, postNo: ask.postNo, force: true }); setAsk(null); }}>
                Перенести всё равно
              </button>
            </div>
          </div>
        </>
      )}
```

- В скрытую форму добавить `{move?.force && <input type="hidden" name="force" value="1" />}`.
- Подпись `tl-ghost` (`"нельзя"`) оставить для `closed`, для `past` показывать время как обычно: `{ghost.reason === "closed" ? "нельзя" : ...}` — не менять, `past` уже попадает в ветку со временем.

- [ ] **Step 2: Timeline — лесенка наложений**

- Импортировать `overlapDepth` из `@/lib/drag`. Перед `return`: `const depth = overlapDepth(blocks);`
- В стиле блока записи (`c.live.map(b => ...)`, объект `style`) добавить:

```ts
                      // Лесенка наложений: вложенный блок сдвинут вправо и
                      // выше по z — обе записи видны и кликабельны.
                      marginLeft: `${(depth.get(b.id) ?? 0) * 14}px`,
                      zIndex: 2 + (depth.get(b.id) ?? 0),
```

- [ ] **Step 3: CalendarDrag — то же подтверждение**

- Вычислить прошлое дня-цели: в `onMove` перед `dayDropAt` добавить (импорт `localDay` из `@/lib/sto/slots`, `minutesOf` — из уже импортируемого `@/lib/drag`):

```ts
    const nowDay = localDay(new Date());
    const nowMin = minutesOf(new Date());
```

и в вызов `dayDropAt` добавить:

```ts
      pastBefore: dd.day < nowDay ? Number.POSITIVE_INFINITY : dd.day === nowDay ? nowMin : undefined,
```

- Состояния: `move` расширить `force: boolean`, добавить `ask` — `{ bookingId: number; day: string; hhmm: string; text: string } | null`.
- `warning()` дополнить case:

```ts
    case "past":
      return `${label}, ${hhmmOf(res.fromMin)} — время уже прошло`;
```

- `onUp`: заменить

```ts
    const res = drag.moved ? over : null;
    const id = drag.id;
    stop();
    if (!res) return;
    if (res.reason) {
      const dd = days.find(d => d.day === res.day);
      setAsk({ bookingId: id, day: res.day, hhmm: hhmmOf(res.fromMin), text: dd ? warning(res, dd.label, dd.blocks) : "Перенести вопреки правилам?" });
      return;
    }
    setMove({ bookingId: id, day: res.day, hhmm: hhmmOf(res.fromMin), force: false });
```

- Диалог — тот же markup, что в Timeline Step 1 (id заголовка `cd-ask-t`; подтверждение — `setMove({ bookingId: ask.bookingId, day: ask.day, hhmm: ask.hhmm, force: true }); setAsk(null);`).
- В скрытую форму: `{move?.force && <input type="hidden" name="force" value="1" />}`. postNo форма по-прежнему не шлёт — пост выберет сервер (`assessSlot`: наименее занятый).

- [ ] **Step 4: Кнопка-скрим**

В `globals.css` рядом с `.scrim`:

```css
button.scrim { border: 0; padding: 0; cursor: pointer; }
```

- [ ] **Step 5: Проверка**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: PASS. Руками в `pnpm dev`: на `/segodnya` перетащить запись на занятое время → красный призрак → бросок → шторка → «Перенести всё равно» (до миграции настоящее наложение честно ответит «Окно только что заняли» — проверить past-бросок); в `/kalendar` перетащить карточку на прошлый день недели → шторка.

- [ ] **Step 6: Коммит**

```bash
git add src/components/Timeline.tsx src/components/CalendarDrag.tsx src/app/globals.css && git commit -m "feat(сетка): бросок вопреки правилам — подтверждение на месте, наложения лесенкой

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Финальная проверка и PR приложения

**Files:** без новых правок (только фиксы по результатам проверки).

- [ ] **Step 1: Вся проверка разом**

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && pnpm build
```

Expected: всё зелёное. Падения чинить здесь же, коммитом `fix: ...`.

- [ ] **Step 2: Ручной прогон сценариев (pnpm dev)**

1. Новая запись на прошедшее время сегодняшнего дня → шторка → создана, видна в сетке.
2. Новая запись на вчерашний день (полоса/календарик назад) → шторка → создана.
3. Новая запись на занятое окно → шторка с «пересечение: …» (до миграции — итоговая ошибка 23P01 «Окно только что заняли», после — успех; зафиксировать в PR, что проверено именно так).
4. Перенос списком окон на занятое → шторка → подтверждение.
5. Перетаскивание в сетке дня на запись → шторка на месте; лесенка после создания наложения.
6. Обычная запись в свободное окно — по-прежнему без шторки, ни одного лишнего клика.

- [ ] **Step 3: PR**

```bash
git push -u origin feat/zapis-s-preduprezhdeniem
```

`gh pr create` в этот репозиторий: título `feat(запись): наложение и задним числом — через попап-предупреждение`; в теле — что изменилось по поверхностям, ссылка на спеку и план, зависимость от PR миграции в abkhaz-auto (мержить ПОСЛЕ наката), список ручных проверок из Step 2. Закончить строкой `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
