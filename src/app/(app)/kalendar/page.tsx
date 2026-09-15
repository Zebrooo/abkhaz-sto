import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { busyIntervals, getBooking, listBookings } from "@/lib/bookings";
import { BookingCard } from "@/components/BookingCard";
import { Flash } from "@/components/Flash";
import { addDays, dayLabel, dayShort, plural, todayLocal, weekStart } from "@/lib/format";
import { freeSlots, localHHMM, localTime } from "@/lib/sto/slots";
import { STO_DAY_LABEL, STO_DAYS } from "@/lib/sto/schedule";
import { canReschedule } from "@/lib/sto/transitions";
import { rescheduleAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const today = todayLocal();
  const day = isDay(pick(sp.d)) ? pick(sp.d) : today;
  const ws = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekRows = await listBookings(shop.id, localTime(ws, "00:00"), localTime(addDays(ws, 7), "00:00"));
  const dayRows = weekRows.filter(r => localTime(day, "00:00") <= new Date(r.starts_at) && new Date(r.starts_at) < localTime(addDays(day, 1), "00:00"));
  const moveId = Number(pick(sp.move));
  const moving = Number.isInteger(moveId) && moveId > 0 ? await getBooking(shop.id, moveId) : null;
  const now = new Date();

  let moveSlots: { hhmm: string; postNo: number }[] = [];
  if (moving && shop.schedule && canReschedule(moving.status)) {
    const durationMin = Math.max(1, Math.round((new Date(moving.ends_at).getTime() - new Date(moving.starts_at).getTime()) / 60_000));
    const busy = await busyIntervals(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00"), moving.id);
    moveSlots = freeSlots({ schedule: shop.schedule, day, durationMin, busy, now }).map(s => ({ hhmm: localHHMM(s.startsAt), postNo: s.postNo }));
  }
  const returnTo = `/kalendar?d=${day}`;
  return (
    <>
      <div className="daynav">
        <Link className="btn btn-sm" href={`/kalendar?d=${addDays(ws, -7)}`} aria-label="Предыдущая неделя">←</Link>
        <div className="title">{dayShort(ws)} – {dayShort(addDays(ws, 6))}</div>
        <Link className="btn btn-sm" href={`/kalendar?d=${addDays(ws, 7)}`} aria-label="Следующая неделя">→</Link>
      </div>
      <div className="week">
        {days.map((d, i) => {
          const n = weekRows.filter(r => canReschedule(r.status) && localTime(d, "00:00") <= new Date(r.starts_at) && new Date(r.starts_at) < localTime(addDays(d, 1), "00:00")).length;
          const off = !shop.schedule || shop.schedule.daysOff.includes(d) || shop.schedule.days[STO_DAYS[i]].length === 0;
          return (
            <Link key={d} href={`/kalendar?d=${d}${moving ? `&move=${moving.id}` : ""}`} aria-current={d === day ? "date" : undefined}>
              <span>{STO_DAY_LABEL[STO_DAYS[i]]}</span>
              <span className="n">{d.slice(8, 10)}</span>
              <span className="c">{off ? "вых" : n > 0 ? `${n} ${plural(n, "запись", "записи", "записей")}` : "—"}</span>
            </Link>
          );
        })}
      </div>
      <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
      {moving && (
        <div className="card">
          <h2>Перенос записи № {moving.id}</h2>
          <div className="small muted">{moving.service.title} · сейчас {dayShort(moving.starts_at.slice(0, 10))} {localHHMM(new Date(moving.starts_at))}. Выберите день сверху и новое время:</div>
          {!shop.schedule ? <p className="err">Сначала задайте расписание</p> : moveSlots.length === 0 ? (
            <p className="muted">В этот день свободных окон нет.</p>
          ) : (
            <form action={rescheduleAction} className="slots" style={{ marginTop: 8 }}>
              <input type="hidden" name="shopId" value={shop.id} />
              <input type="hidden" name="bookingId" value={moving.id} />
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="return" value={`/kalendar?d=${day}&move=${moving.id}`} />
              {moveSlots.map(s => (
                <button key={s.hhmm} className="slot" type="submit" name="hhmm" value={s.hhmm} title={`пост ${s.postNo}`}>{s.hhmm}</button>
              ))}
            </form>
          )}
          <div style={{ marginTop: 8 }}><Link className="btn btn-sm" href={`/kalendar?d=${day}`}>Отмена</Link></div>
        </div>
      )}
      <h2 style={{ fontSize: 16, margin: "8px 0" }}>{day === today ? "Сегодня" : dayLabel(day)}</h2>
      {dayRows.length === 0 ? <div className="card muted">Записей нет.</div> : dayRows.map(b => <BookingCard key={b.id} b={b} returnTo={returnTo} />)}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <Link className="btn btn-primary" href={`/kalendar/novaya?d=${day}`}>Записать клиента</Link>
      </div>
    </>
  );
}
