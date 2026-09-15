import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { countPending } from "@/lib/bookings";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { dayTitle } from "@/lib/format";
import {
  DEFAULT_STO_FREE_CANCEL_HOURS, DEFAULT_STO_STEP_MIN, MAX_STO_FREE_CANCEL_HOURS,
  MAX_STO_POSTS, MAX_STO_PREPAY_AMOUNT, STO_DAYS, STO_DAY_LABEL, STO_STEPS_MIN, type StoDay,
} from "@/lib/sto/schedule";
import { saveIntervalAction, saveScheduleAction, toggleDayOffAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Полное название дня — для веба: STO_DAY_LABEL даёт букву для строки телефона. */
const DAY_FULL: Record<StoDay, string> = {
  mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье",
};

/** Колесо часов: полчаса — самая мелкая граница смены, какая встречается. */
const TIMES = Array.from({ length: 37 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const SCHED_FORM = "sched";
const IV_FORM = "iv";
const HEAD_SUB = "Часы приёма, посты, шаг сетки и предоплата. От этого считаются свободные окна на сайте.";

/**
 * «Расписание» — из чего сайт считает свободные окна: часы приёма по дням,
 * число постов, шаг сетки, разовые выходные и предоплата. Часы правятся по
 * одному интервалу шторкой и сохраняются сразу, остальное — одной кнопкой
 * внизу. Всё выбранное лежит в адресе, клиентского состояния нет.
 */
export default async function SchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const pending = await countPending(shop.id);
  const s = shop.schedule;
  const p = shop.prepay;
  const daysOff = s?.daysOff ?? [];

  const postsRaw = Number(pick(sp.posts));
  const posts = Number.isInteger(postsRaw) && postsRaw >= 1 && postsRaw <= MAX_STO_POSTS ? postsRaw : (s?.posts ?? 1);
  const stepRaw = Number(pick(sp.step));
  const stepMin = (STO_STEPS_MIN as readonly number[]).includes(stepRaw) ? stepRaw : (s?.stepMin ?? DEFAULT_STO_STEP_MIN);
  const modeRaw = pick(sp.prepay);
  const prepayMode = modeRaw === "off" || modeRaw === "fixed" || modeRaw === "percent" ? modeRaw : p.mode;

  // Шторка часов: ?iv=mon-0 правит интервал, ?iv=mon-new добавляет новый.
  const ivMatch = /^(mon|tue|wed|thu|fri|sat|sun)-(new|\d+)$/.exec(pick(sp.iv));
  const ivDay = ivMatch ? (ivMatch[1] as StoDay) : null;
  const ivAt = ivMatch && ivMatch[2] !== "new" ? Number(ivMatch[2]) : -1;
  const ivCurrent = ivDay && ivAt >= 0 ? (s?.days[ivDay][ivAt] ?? null) : null;
  const ivIndex = ivCurrent ? ivAt : -1;
  const fromRaw = pick(sp.from);
  const from = TIMES.includes(fromRaw) ? fromRaw : (ivCurrent?.from ?? "09:00");
  const toRaw = pick(sp.to);
  const to = TIMES.includes(toRaw) ? toRaw : (ivCurrent?.to ?? "18:00");

  // Одна ссылка на все переключатели: то, что не меняем, переезжает как есть,
  // иначе выбранный шаг терялся бы при открытии шторки часов.
  type Over = { posts?: number; step?: number; prepay?: string; iv?: string | null; from?: string | null; to?: string | null };
  const href = (over: Over = {}) => {
    const v = { posts, step: stepMin, prepay: prepayMode, iv: ivMatch ? pick(sp.iv) : null, from, to, ...over };
    const q = new URLSearchParams({ posts: String(v.posts), step: String(v.step), prepay: v.prepay });
    if (v.iv) {
      q.set("iv", v.iv);
      if (v.from) q.set("from", v.from);
      if (v.to) q.set("to", v.to);
    }
    return `/raspisanie?${q.toString()}`;
  };

  return (
    <>
      <ScreenHead title="Расписание" sub="часы, посты, предоплата" back="/menu" unread={pending} />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Расписание</div>
            <div className="head-s">{HEAD_SUB}</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <div className="card sched">
          {STO_DAYS.map(d => {
            const ivs = s?.days[d] ?? [];
            return (
              <div className={ivs.length ? "sched-day" : "sched-day off"} key={d}>
                <div className="d">
                  <span className="d-touch">{STO_DAY_LABEL[d]}</span>
                  <span className="d-web">{DAY_FULL[d]}</span>
                </div>
                <div className="sched-ivs">
                  {ivs.map((iv, i) => (
                    <Link key={`${iv.from}-${iv.to}`} className="iv" href={href({ iv: `${d}-${i}`, from: null, to: null })}>
                      {iv.from}–{iv.to}
                    </Link>
                  ))}
                  {ivs.length === 0 && <span className="iv iv-off">выходной</span>}
                  <Link className="iv iv-add" href={href({ iv: `${d}-new`, from: null, to: null })} aria-label={`${DAY_FULL[d]}: добавить интервал`}>
                    <Icon name="plus" size={13} />интервал
                  </Link>
                </div>
              </div>
            );
          })}
          <p className="sched-note">Пустой день — выходной. Нажмите чип времени — откроется выбор часов колесом; конец смены до полуночи пишется как 24:00.</p>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-t">Посты и сетка</div>
            <div className="split">
              <div>
                <div className="lbl">Постов</div>
                <div className="lbl-s">столько записей идёт разом</div>
              </div>
              <div className="stepper">
                <Link href={href({ posts: Math.max(1, posts - 1) })} aria-label="Постов меньше">−</Link>
                <span className="v">{posts}</span>
                <Link href={href({ posts: Math.min(MAX_STO_POSTS, posts + 1) })} aria-label="Постов больше">+</Link>
              </div>
            </div>

            <div className="set-lab">Шаг окон</div>
            <div className="seg">
              {STO_STEPS_MIN.map(m => (
                <Link key={m} href={href({ step: m })} aria-current={m === stepMin ? "page" : undefined}>{m} мин</Link>
              ))}
            </div>

            <div className="set-lab">Разовые выходные</div>
            <div className="days-off">
              {daysOff.map(d => (
                <form key={d} action={toggleDayOffAction} className="off-day">
                  <input type="hidden" name="shopId" value={shop.id} />
                  <input type="hidden" name="date" value={d} />
                  <button className="rspec is-accent" type="submit" aria-label={`Убрать выходной ${dayTitle(d)}`}>
                    {dayTitle(d)}<span aria-hidden="true">✕</span>
                  </button>
                </form>
              ))}
              <form action={toggleDayOffAction} className="day-add">
                <input type="hidden" name="shopId" value={shop.id} />
                <input type="date" name="date" required aria-label="Дата разового выходного" />
                <button className="iv iv-add" type="submit">+ дата</button>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-t">Предоплата</div>
            <div className="card-s">Берётся на сайте при записи. Ранняя отмена — возврат клиенту на кошелёк, поздняя отмена и неявка — сервису.</div>
            <div className="seg">
              <Link href={href({ prepay: "off" })} aria-current={prepayMode === "off" ? "page" : undefined}>Выключена</Link>
              <Link href={href({ prepay: "fixed" })} aria-current={prepayMode === "fixed" ? "page" : undefined}>Сумма</Link>
              <Link href={href({ prepay: "percent" })} aria-current={prepayMode === "percent" ? "page" : undefined}>Процент</Link>
            </div>
            {prepayMode !== "off" && (
              <div className="flds">
                {prepayMode === "fixed" ? (
                  <label className="fld">
                    <span>Сумма, ₽</span>
                    <input form={SCHED_FORM} className="num" name="prepayAmount" type="number" min={1} max={MAX_STO_PREPAY_AMOUNT} required
                      defaultValue={p.mode === "fixed" ? p.amount : 500} />
                  </label>
                ) : (
                  <label className="fld">
                    <span>Процент</span>
                    <input form={SCHED_FORM} className="num" name="prepayPercent" type="number" min={1} max={100} required
                      defaultValue={p.mode === "percent" ? p.percent : 30} />
                  </label>
                )}
                <label className="fld">
                  <span>Бесплатная отмена, часов</span>
                  <input form={SCHED_FORM} className="num" name="freeCancelHours" type="number" min={0} max={MAX_STO_FREE_CANCEL_HOURS} required
                    defaultValue={p.mode === "off" ? DEFAULT_STO_FREE_CANCEL_HOURS : p.freeCancelHours} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="sticky-actions sched-save">
          {/* Поля предоплаты стоят в карточке выше и связаны с формой через form=. */}
          <form id={SCHED_FORM} action={saveScheduleAction}>
            <input type="hidden" name="shopId" value={shop.id} />
            <input type="hidden" name="posts" value={posts} />
            <input type="hidden" name="stepMin" value={stepMin} />
            <input type="hidden" name="daysOff" value={daysOff.join(", ")} />
            <input type="hidden" name="prepayMode" value={prepayMode} />
            <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit">Сохранить расписание</button>
          </form>
        </div>
      </div>

      {ivDay && (
        <Sheet
          closeHref={href({ iv: null })}
          title="Часы приёма"
          sub={`${DAY_FULL[ivDay].toLowerCase()}, ${ivCurrent ? `интервал ${ivIndex + 1}` : "новый интервал"}`}
          footer={
            <>
              {ivCurrent && <button className="aui-btn aui-btn--outline aui-btn--lg" type="submit" form={IV_FORM} name="remove" value="1">Убрать</button>}
              <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={IV_FORM}>Сохранить интервал</button>
            </>
          }
        >
          <div className="sheet-stack">
            <div className="wheels">
              <div className="fld">
                <span>Начало</span>
                <div className="wheel">
                  {TIMES.map(t => (
                    <Link key={t} href={href({ from: t })} aria-pressed={t === from}>{t}</Link>
                  ))}
                </div>
              </div>
              <div className="fld">
                <span>Конец</span>
                <div className="wheel">
                  {TIMES.map(t => (
                    <Link key={t} href={href({ to: t })} aria-pressed={t === to}>{t}</Link>
                  ))}
                </div>
              </div>
            </div>
            <p className="sheet-note">Два интервала в дне — это обед: 09:00–13:00 и 14:00–18:00.</p>
            {/* Форма живёт в теле, а кнопки — в подвале шторки: их связывает form=. */}
            <form id={IV_FORM} action={saveIntervalAction}>
              <input type="hidden" name="shopId" value={shop.id} />
              <input type="hidden" name="day" value={ivDay} />
              <input type="hidden" name="index" value={ivIndex} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
            </form>
          </div>
        </Sheet>
      )}
    </>
  );
}
