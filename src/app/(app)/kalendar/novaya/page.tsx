import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { busyIntervals } from "@/lib/bookings";
import { listServices } from "@/lib/services";
import { Flash } from "@/components/Flash";
import { addDays, dayLabel, formatRub, todayLocal } from "@/lib/format";
import { freeSlots, localHHMM, localTime } from "@/lib/sto/slots";
import { createManualAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Ручная запись клиента с улицы: услуга и день выбираются ссылками (сервер
// пересчитывает окна), остальное — одной формой. Без клиентского состояния:
// экран простой, а перезагрузка страницы дешевле второго источника правды.
export default async function NewBookingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const day = isDay(pick(sp.d)) ? pick(sp.d) : todayLocal();
  const services = await listServices(shop.id);
  const chosenId = Number(pick(sp.s));
  const svc = services.find(s => s.listingId === chosenId) ?? services[0] ?? null;
  const slots = svc && shop.schedule
    ? freeSlots({ schedule: shop.schedule, day, durationMin: svc.durationMin, busy: await busyIntervals(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00")), now: new Date() })
    : [];
  const link = (d: string, s: number | null) => `/kalendar/novaya?d=${d}${s ? `&s=${s}` : ""}`;
  return (
    <>
      <div className="daynav">
        <Link className="btn btn-sm" href={link(addDays(day, -1), svc?.listingId ?? null)} aria-label="Предыдущий день">←</Link>
        <div className="title">{dayLabel(day)}</div>
        <Link className="btn btn-sm" href={link(addDays(day, 1), svc?.listingId ?? null)} aria-label="Следующий день">→</Link>
      </div>
      <Flash err={pick(sp.err)} />
      {!shop.schedule && <div className="err">Сначала <Link href="/raspisanie">задайте расписание</Link> — без него окон нет.</div>}
      {services.length === 0 && <div className="err">У витрины нет услуг — добавьте их на сайте в кабинете витрины (раздел «Услуги»).</div>}
      <div className="card">
        <h2>Услуга</h2>
        <div className="slots">
          {services.map(s => (
            <Link key={s.listingId} className="slot" href={link(day, s.listingId)} aria-pressed={svc?.listingId === s.listingId}>
              {s.title} · {s.durationMin} мин
            </Link>
          ))}
        </div>
        {svc && <div className="small muted" style={{ marginTop: 6 }}>{formatRub(svc.price)} · {svc.durationMin} мин</div>}
      </div>
      {svc && shop.schedule && (
        <form action={createManualAction} className="card">
          <input type="hidden" name="shopId" value={shop.id} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="listingId" value={svc.listingId} />
          <h2>Время</h2>
          {slots.length === 0 ? <p className="muted">Свободных окон в этот день нет.</p> : (
            <div className="slots" role="radiogroup" aria-label="Свободные окна">
              {slots.map((s, i) => {
                const hhmm = localHHMM(s.startsAt);
                return (
                  <label key={hhmm} className="slot">
                    <input type="radio" name="hhmm" value={hhmm} defaultChecked={i === 0} style={{ marginRight: 6 }} />
                    {hhmm}
                  </label>
                );
              })}
            </div>
          )}
          <h2 style={{ marginTop: 14 }}>Клиент</h2>
          <label className="fld"><span>Имя</span><input name="name" required maxLength={80} autoComplete="off" /></label>
          <label className="fld"><span>Телефон</span><input name="phone" inputMode="tel" placeholder="+7 940 000-00-00" /></label>
          <label className="fld"><span>Машина</span><input name="vehicle" maxLength={80} placeholder="Toyota Camry 2015, А123АВ" /></label>
          <label className="fld"><span>Комментарий</span><textarea name="comment" maxLength={500} /></label>
          <button className="btn btn-primary" type="submit" disabled={slots.length === 0}>Записать</button>
        </form>
      )}
    </>
  );
}
