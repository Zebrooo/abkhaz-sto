import { currentServiceShop } from "@/lib/shop";
import { Flash } from "@/components/Flash";
import { STO_DAYS, STO_DAY_LABEL, STO_STEPS_MIN, MAX_STO_POSTS, DEFAULT_STO_FREE_CANCEL_HOURS } from "@/lib/sto/schedule";
import { saveScheduleAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const s = shop.schedule;
  const p = shop.prepay;
  return (
    <>
      <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
      <form action={saveScheduleAction}>
        <input type="hidden" name="shopId" value={shop.id} />
        <div className="card">
          <h2>Часы работы</h2>
          <p className="muted small">До двух интервалов в день: например, 09:00–13:00 и 14:00–18:00. Пустой день — выходной. Конец смены до полуночи — 24:00.</p>
          {STO_DAYS.map(d => {
            const ivs = s?.days[d] ?? [];
            return (
              <div className="sched-day" key={d}>
                <div className="d">{STO_DAY_LABEL[d]}</div>
                <div className="ivs">
                  {[1, 2].map(i => (
                    <div className="iv" key={i}>
                      <input type="time" name={`${d}_${i}_from`} defaultValue={ivs[i - 1]?.from ?? ""} step={300} aria-label={`${STO_DAY_LABEL[d]}, интервал ${i}, начало`} />
                      <span className="muted">—</span>
                      <input type="text" name={`${d}_${i}_to`} defaultValue={ivs[i - 1]?.to ?? ""} placeholder="18:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" inputMode="numeric" aria-label={`${STO_DAY_LABEL[d]}, интервал ${i}, конец`} style={{ minHeight: 40, padding: "6px 8px", border: "1px solid var(--line-2)", borderRadius: 8 }} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h2>Посты и сетка</h2>
          <div className="fld-inline">
            <label className="fld"><span>Постов (подъёмников)</span><input type="number" name="posts" min={1} max={MAX_STO_POSTS} defaultValue={s?.posts ?? 1} required /></label>
            <label className="fld"><span>Шаг окон</span>
              <select name="stepMin" defaultValue={s?.stepMin ?? 30}>
                {STO_STEPS_MIN.map(m => <option key={m} value={m}>{m} мин</option>)}
              </select>
            </label>
          </div>
          <label className="fld"><span>Выходные и праздники (даты через запятую, ГГГГ-ММ-ДД)</span><textarea name="daysOff" defaultValue={(s?.daysOff ?? []).join(", ")} placeholder="2027-01-01, 2027-01-02" /></label>
        </div>
        <div className="card">
          <h2>Предоплата</h2>
          <p className="muted small">Берётся на сайте при записи. Отмена раньше срока — возврат клиенту на кошелёк сайта; поздняя отмена и неявка — предоплата сервису.</p>
          <label className="fld"><span>Режим</span>
            <select name="prepayMode" defaultValue={p.mode}>
              <option value="off">Выключена</option>
              <option value="fixed">Фиксированная сумма</option>
              <option value="percent">Процент от цены</option>
            </select>
          </label>
          <div className="fld-inline">
            <label className="fld"><span>Сумма, ₽ (для фиксированной)</span><input type="number" name="prepayAmount" min={1} defaultValue={p.mode === "fixed" ? p.amount : 500} /></label>
            <label className="fld"><span>Процент (для процента)</span><input type="number" name="prepayPercent" min={1} max={100} defaultValue={p.mode === "percent" ? p.percent : 30} /></label>
          </div>
          <label className="fld"><span>Бесплатная отмена, часов до записи</span><input type="number" name="freeCancelHours" min={0} max={168} defaultValue={p.mode === "off" ? DEFAULT_STO_FREE_CANCEL_HOURS : p.freeCancelHours} /></label>
        </div>
        <button className="btn btn-primary" type="submit">Сохранить</button>
      </form>
    </>
  );
}
