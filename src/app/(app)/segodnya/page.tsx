import Link from "next/link";
import { requireSection } from "@/lib/context";
import { countPending, dayBookings, listBookings } from "@/lib/bookings";
import { BookingRow } from "@/components/BookingRow";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { DayPick } from "@/components/DayPick";
import { ScreenHead } from "@/components/ScreenHead";
import { PendingBlock, PostsNowBlock, ShiftSummary } from "@/components/Shift";
import { Timeline } from "@/components/Timeline";
import { addDays, count, dayLabel, dayOfWeekLabel, dayTitle, todayLocal } from "@/lib/format";
import { dayStats, dayWindow, isLive } from "@/lib/stats";
import { localDay, localTime } from "@/lib/sto/slots";
import { addMonths, monthFirst, monthOf, safeMonth } from "@/lib/month";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Чипы дня: «Все» — живые записи, остальные — по статусу. */
const FILTERS = [["all", "Все"], ["new", "Ждут"], ["confirmed", "Подтверждены"], ["done", "Выполнены"]] as const;
type Filter = (typeof FILTERS)[number][0];
const isFilter = (s: string): s is Filter => FILTERS.some(([k]) => k === s);

const href = (day: string, filter: Filter, month?: string) =>
  `/segodnya?d=${day}${filter === "all" ? "" : `&f=${filter}`}${month ? `&m=${month}` : ""}`;

/** Сегмент «День | Неделя»: на телефоне над стрелками, на вебе справа в шапке. */
function ModeSeg({ day }: { day: string }) {
  return (
    <div className="seg">
      <Link href={href(day, "all")} aria-current="page">День</Link>
      <Link href={`/kalendar?d=${day}`}>Неделя</Link>
    </div>
  );
}

function StatusChips({ day, filter, counts }: { day: string; filter: Filter; counts: Record<Filter, number> }) {
  return (
    <div className="chips">
      {FILTERS.map(([key, label]) => (
        <Link key={key} className="chip" href={href(day, key)} aria-current={key === filter ? "page" : undefined}>
          {label} {counts[key]}
        </Link>
      ))}
    </div>
  );
}

/**
 * День таймлайном — главный экран за стойкой. На телефоне сетка часов и под
 * ней список записей, на вебе список заменяет правая колонка со сводкой
 * смены: одни и те же данные, разный порядок чтения.
 */
export default async function TodayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Гейт по роли: раздел закрыт — requireSection уводит на первый экран роли.
  const ctx = (await requireSection("bookings"))!;
  const shop = ctx.shop;
  const today = todayLocal();
  const day = isDay(pick(sp.d)) ? pick(sp.d) : today;
  const f = pick(sp.f);
  const filter: Filter = isFilter(f) ? f : "all";

  // Маленький календарь: месяц из адреса и точки под числами по записям
  // месяца — видно, где густо, не листая дни по одному.
  // Календарь открыт ровно тогда, когда месяц есть в адресе: закрытый не
  // стоит экрану ни одного запроса.
  const month = pick(sp.m) ? safeMonth(pick(sp.m), day) : "";
  const [rows, monthRows] = await Promise.all([
    dayBookings(shop.id, day),
    month
      ? listBookings(shop.id, localTime(monthFirst(month), "00:00"), localTime(`${addMonths(month, 1)}-01`, "00:00"))
      : Promise.resolve([]),
  ]);
  const monthCounts: Record<string, number> = {};
  for (const b of monthRows.filter(isLive)) {
    const d = localDay(new Date(b.starts_at));
    monthCounts[d] = (monthCounts[d] ?? 0) + 1;
  }
  const pending = await countPending(shop.id);
  const posts = shop.schedule?.posts ?? Math.max(1, ...rows.map(r => r.post_no));
  const live = rows.filter(isLive);
  const counts: Record<Filter, number> = {
    all: live.length,
    new: live.filter(b => b.status === "new").length,
    confirmed: live.filter(b => b.status === "confirmed").length,
    done: live.filter(b => b.status === "done").length,
  };
  // Фильтр сужает список, но не сетку: в макете он прячет записи и там, а
  // свободные окна считаются по видимым — пост с отфильтрованной записью
  // выглядел бы пустым, и в занятое время предложили бы записать.
  const visible = filter === "all" ? live : live.filter(b => b.status === filter);
  const stats = dayStats({ rows, schedule: shop.schedule, day, posts });
  const off = dayWindow(shop.schedule, day).off;
  const now = new Date();
  const returnTo = href(day, filter);

  return (
    <>
      <ScreenHead title="Записи" sub={dayLabel(day)} unread={pending} />
      <div className="page board stack">
        <div className="head">
          <div>
            <div className="head-t">{dayLabel(day)}</div>
            <div className="head-s">
              {count(stats.count, "запись", "записи", "записей")} · {count(posts, "пост", "поста", "постов")} · загрузка {stats.loadPct}%
            </div>
          </div>
          <div className="daynav">
            <Link className="ico prev" href={href(addDays(day, -1), filter)} aria-label="Предыдущий день"><Icon name="chevron" size={16} /></Link>
            <Link href={href(today, filter)}>Сегодня</Link>
            <Link className="ico" href={href(addDays(day, 1), filter)} aria-label="Следующий день"><Icon name="chevron" size={16} /></Link>
          </div>
          <div className="head-tail">
          <DayPick
            day={day}
            month={month}
            label={dayTitle(day)}
            counts={monthCounts}
            openHref={href(day, filter, monthOf(day))}
            closeHref={href(day, filter)}
            dayHref={d => href(d, filter)}
            monthHref={mm => href(day, filter, mm)}
            isOff={d => dayWindow(shop.schedule, d).off}
          />
            <ModeSeg day={day} />
            <StatusChips day={day} filter={filter} counts={counts} />
          </div>
        </div>

        <div className="dayctl m-only">
          <ModeSeg day={day} />
          <div className="dnav">
            <Link className="prev" href={href(addDays(day, -1), filter)} aria-label="Предыдущий день"><Icon name="chevron" size={17} /></Link>
            <div>
              <div className="dnav-t">{dayTitle(day)}</div>
              <div className="dnav-s">{dayOfWeekLabel(day)} · {count(stats.count, "запись", "записи", "записей")} · {stats.loadPct}%</div>
            </div>
            <Link href={href(addDays(day, 1), filter)} aria-label="Следующий день"><Icon name="chevron" size={17} /></Link>
          </div>
          <StatusChips day={day} filter={filter} counts={counts} />
          <DayPick
            day={day}
            month={month}
            label={dayTitle(day)}
            counts={monthCounts}
            openHref={href(day, filter, monthOf(day))}
            closeHref={href(day, filter)}
            dayHref={d => href(d, filter)}
            monthHref={mm => href(day, filter, mm)}
            isOff={d => dayWindow(shop.schedule, d).off}
          />
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        {!shop.schedule && (
          <div className="card card-accent note">
            <div className="note-t">Расписание не задано</div>
            <div className="note-s">Клиенты не видят свободных окон и не могут записаться с сайта, а сетка ниже нарисована по запасным часам 09:00–18:00.</div>
            <div className="note-b">
              <Link className="aui-btn aui-btn--outline aui-btn--sm" href="/raspisanie">Задать часы работы</Link>
            </div>
          </div>
        )}

        <div className="card tl-wrap">
          <Timeline rows={live} schedule={shop.schedule} posts={posts} day={day} now={now} shopId={shop.id} returnTo={returnTo} />
        </div>

        <p className="hint m-only">Запись тянется за ручку в углу блока: наложение по времени подсвечивается красным, и бросить туда нельзя.</p>

        <div className="tl-legend m-only">
          <span><i className="l-new" />ждёт</span>
          <span><i className="l-confirmed" />подтверждена</span>
          <span><i className="l-done" />выполнена</span>
        </div>

        {/* На вебе день целиком виден в сетке, поэтому список прячем — но
            когда выбран чип, он единственный показывает выбранное. */}
        <div className={`daylist${filter === "all" ? " m-only" : ""}`}>
          <div className="sect">Записи дня</div>
          {visible.length === 0 ? (
            <div className="card">
              <div className="empty">
                <span className="sq"><Icon name="calendar" size={26} /></span>
                {filter === "all" ? (
                  <>
                    <div className="empty-t">{off ? "Выходной" : day === today ? "На сегодня записей нет" : "В этот день записей нет"}</div>
                    <div className="empty-s">
                      {off
                        ? "Сервис не работает: окон нет и записаться с сайта нельзя. Разовый выходной снимается в расписании."
                        : `Свободны все ${count(posts, "пост", "поста", "постов")}. Клиента с улицы записывайте кнопкой ниже — окна считаются по расписанию.`}
                    </div>
                    {off
                      ? <Link className="aui-btn aui-btn--outline aui-btn--md" href="/raspisanie">Открыть расписание</Link>
                      : <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/kalendar/novaya?d=${day}`}>Записать клиента</Link>}
                  </>
                ) : (
                  <>
                    <div className="empty-t">С таким статусом записей нет</div>
                    <div className="empty-s">В этом дне {counts.all === 0 ? "записей нет вовсе" : `есть другие: всего ${counts.all}`}.</div>
                    <Link className="aui-btn aui-btn--outline aui-btn--md" href={href(day, "all")}>Показать все</Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            visible.map(b => <BookingRow key={b.id} b={b} returnTo={returnTo} day={day} />)
          )}
        </div>
      </div>

      <aside className="rail">
        <ShiftSummary rows={rows} schedule={shop.schedule} day={day} posts={posts} />
        <PendingBlock rows={rows} day={day} returnTo={returnTo} />
        <PostsNowBlock rows={rows} schedule={shop.schedule} day={day} posts={posts} now={now} />
      </aside>
    </>
  );
}
