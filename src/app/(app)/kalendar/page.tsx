import type { CSSProperties } from "react";
import Link from "next/link";
import { requireSection } from "@/lib/context";
import { busyIntervals, countPending, getBooking, listBookings } from "@/lib/bookings";
import { BookingRow } from "@/components/BookingRow";
import { CalendarDrag, type DragDay } from "@/components/CalendarDrag";
import { PendingBlock, PostsNowBlock, ShiftSummary } from "@/components/Shift";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { DayPick } from "@/components/DayPick";
import { ScreenHead } from "@/components/ScreenHead";
import { STATUS_SHORT } from "@/components/Status";
import { addDays, count, dayNumber, dayOfWeekShort, dayTitle, rangeLabel, rub, todayLocal, weekStart } from "@/lib/format";
import { dayStats, dayWindow, isLive } from "@/lib/stats";
import { monthGrid, monthOf, safeMonth } from "@/lib/month";
import { busyBlocks, toDragBlock } from "@/lib/drag";
import { dayOfWeek, freeSlots, localDay, localHHMM, localTime } from "@/lib/sto/slots";
import { canReschedule } from "@/lib/sto/transitions";
import { rescheduleAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const FILTERS = [["all", "Все"], ["new", "Ждут"], ["confirmed", "Подтверждены"], ["done", "Выполнены"]] as const;
type Filter = (typeof FILTERS)[number][0];
const isFilter = (s: string): s is Filter => FILTERS.some(([k]) => k === s);

/** Адрес недели: день, фильтр, незакрытый перенос и открытый месяц живут в запросе. */
const href = (day: string, filter: Filter, move?: number | null, month?: string) =>
  `/kalendar?d=${day}${filter === "all" ? "" : `&f=${filter}`}${move ? `&move=${move}` : ""}${month ? `&m=${month}` : ""}`;

/** Фильтр статусов: стоит и в шапке веба, и в блоке управления телефона. */
function StatusChips({ day, filter, counts, move }: { day: string; filter: Filter; counts: Record<Filter, number>; move?: number | null }) {
  return (
    <div className="chips">
      {FILTERS.map(([key, label]) => (
        <Link key={key} className="chip" href={href(day, key, move)} aria-current={key === filter ? "page" : undefined}>
          {label} {counts[key]}
        </Link>
      ))}
    </div>
  );
}

function ModeSeg({ day }: { day: string }) {
  return (
    <div className="seg">
      <Link href={`/segodnya?d=${day}`}>День</Link>
      <Link href={href(day, "all")} aria-current="page">Неделя</Link>
    </div>
  );
}

/**
 * Неделя столбиками: высота — записи дня, под числом — сколько их. Ниже
 * записи выбранного дня. Перенос открывается тем же адресом (?move=ID),
 * поэтому клиентского состояния экрану не нужно.
 */
export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Гейт по роли: раздел закрыт — requireSection уводит на первый экран роли.
  const ctx = (await requireSection("bookings"))!;
  const shop = ctx.shop;
  const today = todayLocal();
  const day = isDay(pick(sp.d)) ? pick(sp.d) : today;
  const f = pick(sp.f);
  const filter: Filter = isFilter(f) ? f : "all";
  const ws = weekStart(day);
  // Маленький календарь: месяц в адресе, точки под числами — по записям
  // месяца. Запрос один и тот же по границам месяца, поэтому точки честные,
  // а не «есть что-то на этой неделе».
  // Календарь открыт ровно тогда, когда месяц есть в адресе: закрытый не
  // стоит экрану ни одного запроса.
  const month = pick(sp.m) ? safeMonth(pick(sp.m), day) : "";
  const grid = month ? monthGrid(month) : [];
  const gridFrom = grid[0]?.day ?? day;
  const gridTo = grid[grid.length - 1]?.day ?? day;
  const [weekRows, monthRows] = await Promise.all([
    listBookings(shop.id, localTime(ws, "00:00"), localTime(addDays(ws, 7), "00:00")),
    month
      // Границы — по СЕТКЕ, а не по месяцу: в ней видны и последние дни
      // прошлого месяца, и первые полторы недели следующего, и по ним можно
      // ткнуть. Без точек они читались бы как свободные.
      ? listBookings(shop.id, localTime(gridFrom, "00:00"), localTime(addDays(gridTo, 1), "00:00"))
      : Promise.resolve([]),
  ]);
  const monthCounts: Record<string, number> = {};
  for (const b of monthRows.filter(isLive)) {
    const d = localDay(new Date(b.starts_at));
    monthCounts[d] = (monthCounts[d] ?? 0) + 1;
  }
  const pending = await countPending(shop.id);
  const posts = shop.schedule?.posts ?? Math.max(1, ...weekRows.map(r => r.post_no));

  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map(d => {
    const rows = weekRows.filter(b => localDay(new Date(b.starts_at)) === d);
    const s = dayStats({ rows, schedule: shop.schedule, day: d, posts });
    return { day: d, rows, n: s.count, revenue: s.revenue, busy: s.busySlots, slots: s.totalSlots, off: dayWindow(shop.schedule, d).off };
  });
  const maxN = Math.max(1, ...week.map(w => w.n));
  const total = week.reduce((s, w) => s + w.n, 0);
  const revenue = week.reduce((s, w) => s + w.revenue, 0);
  const slots = week.reduce((s, w) => s + w.slots, 0);
  const loadPct = slots > 0 ? Math.min(100, Math.round((week.reduce((s, w) => s + w.busy, 0) / slots) * 100)) : 0;

  const live = (week.find(w => w.day === day)?.rows ?? []).filter(isLive);
  const counts: Record<Filter, number> = {
    all: live.length,
    new: live.filter(b => b.status === "new").length,
    confirmed: live.filter(b => b.status === "confirmed").length,
    done: live.filter(b => b.status === "done").length,
  };
  const visible = filter === "all" ? live : live.filter(b => b.status === filter);

  const moveId = Number(pick(sp.move));
  const moving = Number.isInteger(moveId) && moveId > 0 ? await getBooking(shop.id, moveId) : null;
  let moveSlots: { hhmm: string; postNo: number }[] = [];
  if (moving && shop.schedule && canReschedule(moving.status)) {
    const durationMin = Math.max(1, Math.round((new Date(moving.ends_at).getTime() - new Date(moving.starts_at).getTime()) / 60_000));
    const busy = await busyIntervals(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00"), moving.id);
    moveSlots = freeSlots({ schedule: shop.schedule, day, durationMin, busy, now: new Date() })
      .map(s => ({ hhmm: localHHMM(s.startsAt), postNo: s.postNo }));
  }
  const returnTo = href(day, filter, moving?.id);
  // Неделя для перетаскивания: часы приёма каждого дня и занятые им записи —
  // ровно то, по чему сервер потом решит, встанет запись или нет.
  const dragDays: DragDay[] = week.map(w => ({
    day: w.day,
    label: dayTitle(w.day),
    intervals: shop.schedule && !shop.schedule.daysOff.includes(w.day) ? (shop.schedule.days[dayOfWeek(w.day)] ?? []) : [],
    blocks: busyBlocks(w.rows),
  }));
  // Тянуть можно только живую запись выбранного дня — и из списка, и из
  // блока «ждут ответа» в правой колонке.
  const movable = live.filter(b => canReschedule(b.status)).map(toDragBlock);
  // Правая колонка на вебе — та же, что у дня: неделя не отменяет смену,
  // которая идёт прямо сейчас.
  const dayRows = week.find(w => w.day === day)?.rows ?? [];
  const now = new Date();

  return (
    <CalendarDrag
      shopId={shop.id}
      day={day}
      posts={posts}
      bufferMin={shop.schedule?.bufferMin ?? 0}
      days={dragDays}
      movable={movable}
      returnTo={returnTo}
    >
      <ScreenHead title="Записи" sub={rangeLabel(ws, addDays(ws, 6))} unread={pending} />
      <div className="page board stack">
        <div className="head">
          <div>
            <div className="head-t">{rangeLabel(ws, addDays(ws, 6))}</div>
            <div className="head-s">{count(total, "запись", "записи", "записей")} · выручка {rub(revenue)}</div>
          </div>
          <div className="daynav">
            <Link className="ico prev" href={href(addDays(day, -7), filter, moving?.id)} aria-label="Предыдущая неделя"><Icon name="chevron" size={16} /></Link>
            <Link href={href(today, filter, moving?.id)}>Сегодня</Link>
            <Link className="ico" href={href(addDays(day, 7), filter, moving?.id)} aria-label="Следующая неделя"><Icon name="chevron" size={16} /></Link>
          </div>
          <DayPick
            day={day}
            month={month}
            label={dayTitle(day)}
            counts={monthCounts}
            openHref={href(day, filter, moving?.id, monthOf(day))}
            closeHref={href(day, filter, moving?.id)}
            dayHref={d => href(d, filter, moving?.id)}
            monthHref={m => href(day, filter, moving?.id, m)}
            isOff={d => dayWindow(shop.schedule, d).off}
          />
          <div className="head-tail">
            <ModeSeg day={day} />
            <StatusChips day={day} filter={filter} counts={counts} move={moving?.id} />
          </div>
        </div>

        <div className="dayctl m-only">
          <ModeSeg day={day} />
          <div className="dnav">
            <Link className="prev" href={href(addDays(day, -7), filter, moving?.id)} aria-label="Предыдущая неделя"><Icon name="chevron" size={17} /></Link>
            <div>
              <div className="dnav-t">{rangeLabel(ws, addDays(ws, 6))}</div>
              <div className="dnav-s">{count(total, "запись", "записи", "записей")} · загрузка {loadPct}%</div>
            </div>
            <Link href={href(addDays(day, 7), filter, moving?.id)} aria-label="Следующая неделя"><Icon name="chevron" size={17} /></Link>
          </div>
          <StatusChips day={day} filter={filter} counts={counts} move={moving?.id} />
          <DayPick
            day={day}
            month={month}
            label={dayTitle(day)}
            counts={monthCounts}
            openHref={href(day, filter, moving?.id, monthOf(day))}
            closeHref={href(day, filter, moving?.id)}
            dayHref={d => href(d, filter, moving?.id)}
            monthHref={m => href(day, filter, moving?.id, m)}
            isOff={d => dayWindow(shop.schedule, d).off}
          />
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <div className="card week-card">
          <div className="week-bars">
            {week.map(w => (
              <Link key={w.day} href={href(w.day, filter, moving?.id)} aria-current={w.day === day ? "date" : undefined} data-drop-day={w.day}>
                <span className="n">
                  <span className="n-day">{w.n || "—"}</span>
                  <span className="n-web">{w.n ? rub(w.revenue) : "—"}</span>
                </span>
                {/* Доля самого загруженного дня недели — в пиксели её переводит CSS. */}
                <i className={w.n ? "has" : undefined} style={{ "--k": w.n / maxN } as CSSProperties} />
              </Link>
            ))}
          </div>
          <div className="week-days">
            {week.map(w => (
              <Link key={w.day} href={href(w.day, filter, moving?.id)} aria-current={w.day === day ? "date" : undefined} data-drop-day={w.day}>
                <span className="dow">{dayOfWeekShort(w.day)}</span>
                <span className="num">{dayNumber(w.day)}</span>
                <span className="cnt">{w.n > 0 ? count(w.n, "запись", "записи", "записей") : shop.schedule && w.off ? "выходной" : "—"}</span>
              </Link>
            ))}
          </div>
        </div>

        <p className="hint">Нажмите день — ниже покажутся его записи. Запись переносится перетаскиванием: тяните её за ручку на другой день недели, и он подсветится — зелёным, если время свободно, красным, если занято. Сетка часов со свободными окнами — в «День».</p>

        {moving && (
          <div className="card note">
            <div className="note-t">Перенос записи № {moving.id}</div>
            <div className="note-s">
              {moving.service.title} · сейчас {dayTitle(localDay(new Date(moving.starts_at)))}, {localHHMM(new Date(moving.starts_at))}.
              Выберите день выше и новое время.
            </div>
            {!shop.schedule ? (
              <p className="note-s">Сначала задайте расписание — без него свободных окон не из чего считать.</p>
            ) : !canReschedule(moving.status) ? (
              <p className="note-s">Запись «{STATUS_SHORT[moving.status]}» — переносить нечего.</p>
            ) : moveSlots.length === 0 ? (
              <p className="note-s">В этот день свободных окон нет.</p>
            ) : (
              <form action={rescheduleAction} className="slots">
                <input type="hidden" name="shopId" value={shop.id} />
                <input type="hidden" name="bookingId" value={moving.id} />
                <input type="hidden" name="day" value={day} />
                <input type="hidden" name="return" value={returnTo} />
                {moveSlots.map(s => (
                  <button key={s.hhmm} className="slot" type="submit" name="hhmm" value={s.hhmm} title={`пост ${s.postNo}`}>{s.hhmm}</button>
                ))}
              </form>
            )}
            <div className="note-b">
              <Link className="aui-btn aui-btn--ghost aui-btn--sm" href={href(day, filter)}>Отмена</Link>
            </div>
          </div>
        )}

        <div className="sect">Записи дня</div>
        {visible.length === 0 ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="calendar" size={26} /></span>
              <div className="empty-t">{filter === "all" ? "В этот день записей нет" : "С таким статусом записей нет"}</div>
              <div className="empty-s">
                {filter === "all"
                  ? "Выберите другой день столбиком выше или запишите клиента — окна считаются по расписанию."
                  : `В этом дне ${counts.all === 0 ? "записей нет вовсе" : `есть другие: всего ${counts.all}`}.`}
              </div>
              {filter === "all"
                ? <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/kalendar/novaya?d=${day}`}>Записать клиента</Link>
                : <Link className="aui-btn aui-btn--outline aui-btn--md" href={href(day, "all", moving?.id)}>Показать все</Link>}
            </div>
          </div>
        ) : (
          <div className="grid-2">
            {visible.map(b => <BookingRow key={b.id} b={b} returnTo={returnTo} day={day} />)}
          </div>
        )}
      </div>

      <aside className="rail">
        <ShiftSummary rows={dayRows} schedule={shop.schedule} day={day} posts={posts} />
        <PendingBlock rows={dayRows} day={day} returnTo={returnTo} />
        <PostsNowBlock rows={dayRows} schedule={shop.schedule} day={day} posts={posts} now={now} />
      </aside>
    </CalendarDrag>
  );
}
