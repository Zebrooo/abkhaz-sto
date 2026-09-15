import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { listBookings } from "@/lib/bookings";
import { BookingCard } from "@/components/BookingCard";
import { Flash } from "@/components/Flash";
import { addDays, dayLabel, todayLocal } from "@/lib/format";
import { localTime } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function TodayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const today = todayLocal();
  const day = isDay(pick(sp.d)) ? pick(sp.d) : today;
  const rows = await listBookings(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00"));
  const posts = shop.schedule?.posts ?? Math.max(1, ...rows.map(r => r.post_no));
  const returnTo = `/segodnya?d=${day}`;
  return (
    <>
      <div className="daynav">
        <Link className="btn btn-sm" href={`/segodnya?d=${addDays(day, -1)}`} aria-label="Предыдущий день">←</Link>
        <div style={{ textAlign: "center" }}>
          <div className="title">{day === today ? "Сегодня" : dayLabel(day)}</div>
          {day === today && <div className="muted small">{dayLabel(day)}</div>}
        </div>
        <Link className="btn btn-sm" href={`/segodnya?d=${addDays(day, 1)}`} aria-label="Следующий день">→</Link>
      </div>
      <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
      {!shop.schedule && (
        <div className="card">
          <b>Расписание не задано</b> — клиенты не видят свободных окон. <Link href="/raspisanie">Задать расписание</Link>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card muted">Записей нет. <Link href={`/kalendar/novaya?d=${day}`}>Записать клиента</Link></div>
      ) : (
        Array.from({ length: posts }, (_, i) => i + 1).map(post => {
          const list = rows.filter(r => r.post_no === post);
          if (list.length === 0) return null;
          return (
            <section key={post}>
              {posts > 1 && <h3 className="post-h">Пост {post}</h3>}
              {list.map(b => <BookingCard key={b.id} b={b} returnTo={returnTo} />)}
            </section>
          );
        })
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <Link className="btn btn-primary" href={`/kalendar/novaya?d=${day}`}>Записать клиента</Link>
      </div>
    </>
  );
}
