import Link from "next/link";
import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/access";
import { requireSection } from "@/lib/context";
import { countPending, dayBookings } from "@/lib/bookings";
import { clientName } from "@/components/BookingRow";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { StatusBadge } from "@/components/Status";
import { PendingBlock, PostsNowBlock, ShiftSummary } from "@/components/Shift";
import { count, dayLabel, shortName, todayLocal } from "@/lib/format";
import { dayWindow, isLive } from "@/lib/stats";
import { localHHMM } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * «Смена» — первый экран за стойкой: сводка дня, что ждёт ответа, что на
 * постах прямо сейчас и что будет дальше. День всегда сегодняшний: вчера и
 * завтра листаются на «Записях», а здесь человек смотрит на текущую смену.
 */
export default async function ShiftPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Гейт по роли: раздел закрыт — requireSection уводит на первый экран роли.
  const ctx = (await requireSection("shift"))!;
  // Корень — первый экран роли. Хозяину «Смена» открыта, но входит он в
  // «Деньги»: логотип и адрес без пути ведут туда, куда ведёт его вкладка.
  if (HOME_PATH[ctx.role] !== "/") redirect(HOME_PATH[ctx.role]);
  const shop = ctx.shop;
  const day = todayLocal();
  const now = new Date();
  const [rows, pending] = await Promise.all([dayBookings(shop.id, day), countPending(shop.id)]);
  const posts = shop.schedule?.posts ?? Math.max(1, ...rows.map(r => r.post_no));
  const win = dayWindow(shop.schedule, day);
  const openLine = !shop.schedule ? "расписание не задано" : win.off ? "сегодня выходной" : `открыт до ${hhmm(win.toMin)}`;
  // Впереди — то, что ещё не началось: идущее сейчас уже показано на постах.
  const next = rows.filter(b => isLive(b) && new Date(b.starts_at) > now);
  const live = rows.filter(isLive);
  const newHref = `/kalendar/novaya?d=${day}`;
  return (
    <>
      <ScreenHead title={shop.name} sub={`${count(posts, "пост", "поста", "постов")} · ${openLine}`} unread={pending} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Смена</div>
            <div className="head-s">{dayLabel(day)} · {count(live.length, "запись", "записи", "записей")} · {openLine}</div>
          </div>
        </div>
        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
        <ShiftSummary rows={rows} schedule={shop.schedule} day={day} posts={posts} />
        {rows.length === 0 ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="calendar" size={26} /></span>
              <div className="empty-t">На сегодня записей нет</div>
              <div className="empty-s">
                {posts === 1 ? "Пост свободен." : `Свободны все ${count(posts, "пост", "поста", "постов")}.`}
                {" "}Клиент с улицы — записывайте кнопкой ниже, окна считаются по расписанию.
              </div>
              <Link className="aui-btn aui-btn--primary aui-btn--md" href={newHref}>Записать клиента</Link>
            </div>
          </div>
        ) : (
          <>
            <PendingBlock rows={rows} day={day} returnTo="/" />
            <PostsNowBlock rows={rows} schedule={shop.schedule} day={day} posts={posts} now={now} />
            {next.length > 0 && <div className="sect rail-t">Дальше сегодня</div>}
            <div className="card card-flat">
              {next.map(b => (
                <Link key={b.id} className="row" href={`/zapis/${b.id}?d=${day}`}>
                  <span className="mono row-at">{localHHMM(new Date(b.starts_at))}</span>
                  <div className="row-main">
                    <div className="row-t">{b.service.title}</div>
                    <div className="row-s">{shortName(clientName(b))} · пост {b.post_no}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </Link>
              ))}
              <Link className="row-more" href={`/segodnya?d=${day}`}>
                Весь день на таймлайне <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          </>
        )}
        {!shop.schedule && (
          <div className="card card-accent">
            <div className="note-t">Расписание не задано</div>
            <div className="note-s">Клиенты не видят свободных окон и не могут записаться с сайта.</div>
            <Link className="aui-btn aui-btn--outline aui-btn--sm" href="/raspisanie">Задать часы работы</Link>
          </div>
        )}
      </div>
    </>
  );
}
