import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { busyIntervals, countPending } from "@/lib/bookings";
import { listServices } from "@/lib/services";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { addDays, dayNumber, dayOfWeekShort, dayTitle, formatRub, minutesLabel, todayLocal } from "@/lib/format";
import { freeSlots, localHHMM, localTime } from "@/lib/sto/slots";
import { shopStorefrontUrl } from "@/lib/site";
import { createManualAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Шаги мастера: подпись в шапке телефона и заголовок над содержимым шага. */
const STEPS = [
  { title: "Услуга", sub: "шаг 1 из 3 · от неё длина окна" },
  { title: "Когда", sub: "шаг 2 из 3 · свободные окна" },
  { title: "Клиент", sub: "шаг 3 из 3 · остаётся в карточке" },
] as const;

const HEAD_SUB = "клиент с улицы или по телефону · окна считаются по расписанию";

/**
 * Ручная запись клиента с улицы или по телефону. Шаг, день, услуга, пост и
 * окно живут в адресе: сервер сам пересчитывает свободные окна от выбранной
 * услуги, поэтому клиентского состояния экрану не нужно. На телефоне это
 * мастер в три шага, на вебе — то же окно целиком: услуги слева, день и
 * клиент справа, итог в подвале.
 */
export default async function NewBookingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const pending = await countPending(shop.id);
  const today = todayLocal();
  const day = isDay(pick(sp.d)) ? pick(sp.d) : today;
  const services = await listServices(shop.id);
  const err = pick(sp.err);
  const schedule = shop.schedule;

  // Без расписания окна не из чего считать, без услуг — не от чего считать
  // длину окна. Обе дыры чинятся не здесь, поэтому просто ведём туда.
  if (!schedule || services.length === 0) {
    return (
      <>
        <ScreenHead title="Новая запись" sub={HEAD_SUB} back={`/segodnya?d=${day}`} unread={pending} />
        <div className="page stack">
          <div className="head">
            <div>
              <div className="head-t">Записать клиента</div>
              <div className="head-s">{HEAD_SUB}</div>
            </div>
          </div>
          <Flash err={err} />
          {!schedule ? (
            <div className="card card-accent">
              <div className="note-t">Расписание не задано</div>
              <div className="note-s">Свободных окон не из чего считать: сначала задайте часы приёма и число постов.</div>
              <Link className="aui-btn aui-btn--outline aui-btn--sm" href="/raspisanie">Задать часы работы</Link>
            </div>
          ) : (
            <div className="card card-accent">
              <div className="note-t">У витрины нет услуг</div>
              <div className="note-s">Длина окна считается от длительности услуги. Услуги и цены заводятся в кабинете витрины на сайте.</div>
              <a className="aui-btn aui-btn--outline aui-btn--sm" href={shopStorefrontUrl(shop.id)}>Открыть витрину на сайте</a>
            </div>
          )}
        </div>
      </>
    );
  }

  const stepRaw = Number(pick(sp.step));
  const step = stepRaw === 1 || stepRaw === 2 ? stepRaw : 0;
  const svc = services.find(s => s.listingId === Number(pick(sp.s))) ?? services[0];
  const postRaw = Number(pick(sp.post));
  const postNo = Number.isInteger(postRaw) && postRaw >= 1 && postRaw <= schedule.posts ? postRaw : null;
  // Таймлайн ведёт сюда со своим hhmm — принимаем оба имени, иначе выбранное
  // прямо на сетке окно теряется по дороге.
  const timeRaw = pick(sp.t) || pick(sp.hhmm);
  const time = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : "";

  const busy = await busyIntervals(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00"));
  // Выбран конкретный пост — считаем его «сервисом на один пост»: freeSlots
  // отдаёт первый свободный из всех, а нужен именно этот.
  const slots = freeSlots({
    schedule: postNo ? { ...schedule, posts: 1 } : schedule,
    day,
    durationMin: svc.durationMin,
    busy: postNo ? busy.filter(b => b.postNo === postNo).map(b => ({ ...b, postNo: 1 })) : busy,
    now: new Date(),
  }).map(s => ({ hhmm: localHHMM(s.startsAt), postNo: postNo ?? s.postNo }));

  const chosen = slots.find(s => s.hhmm === time) ?? null;
  // Полоса дней — пять вперёд от сегодня; если пришли на день за её краем,
  // полоса начинается с него, иначе выбранного дня в ней не видно.
  const first = day >= today && day <= addDays(today, 4) ? today : day;
  const days = Array.from({ length: 5 }, (_, i) => addDays(first, i));
  const when = chosen
    ? `${dayTitle(day)}, ${chosen.hhmm} · пост ${chosen.postNo} · ${minutesLabel(svc.durationMin)}`
    : `${dayTitle(day)} · окно не выбрано · ${minutesLabel(svc.durationMin)}`;

  type Over = { step?: number; d?: string; s?: number; post?: number | null; t?: string | null };
  const href = (over: Over) => {
    const v = { step, d: day, s: svc.listingId, post: postNo, t: time, ...over };
    const q = new URLSearchParams({ d: v.d, s: String(v.s) });
    if (v.step) q.set("step", String(v.step));
    if (v.post) q.set("post", String(v.post));
    if (v.t) q.set("t", v.t);
    return `/kalendar/novaya?${q.toString()}`;
  };

  return (
    <>
      <ScreenHead title="Новая запись" sub={STEPS[step].sub} back={`/segodnya?d=${day}`} unread={pending} />
      <div className="page stack nb" data-step={step}>
        <div className="head">
          <div>
            <div className="head-t">Записать клиента</div>
            <div className="head-s">{HEAD_SUB}</div>
          </div>
        </div>

        <Flash err={err} />

        <div className="sect">
          {STEPS[step].title}
          <span className="sheet-dots" aria-hidden="true">
            {STEPS.map((s, i) => <i key={s.title} className={`${i <= step ? "on" : ""}${i === step ? " at" : ""}`} />)}
          </span>
        </div>

        <form action={createManualAction} className="nb-box">
          <input type="hidden" name="shopId" value={shop.id} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="listingId" value={svc.listingId} />
          <input type="hidden" name="hhmm" value={time} />
          {postNo && <input type="hidden" name="postNo" value={postNo} />}

          <div className="nb-cols">
            <div className="nb-svc">
              <div className="nb-lab">Услуга</div>
              {services.map(s => (
                <Link key={s.listingId} className="pick" href={href({ s: s.listingId, t: null })} aria-pressed={s.listingId === svc.listingId}>
                  <div className="pick-main">
                    <div className="pick-t">{s.title}</div>
                    <div className="pick-s">{formatRub(s.price)} · {minutesLabel(s.durationMin)}</div>
                  </div>
                  {s.listingId === svc.listingId && <span className="pick-on"><Icon name="check" size={15} /></span>}
                </Link>
              ))}
            </div>

            <div className="nb-right">
              <div className="nb-when">
                <div>
                  <div className="nb-l"><span className="nb-p">День</span><span className="nb-w">День и пост</span></div>
                  <div className="daypick">
                    {days.map(d => (
                      <Link key={d} href={href({ d, t: null })} aria-pressed={d === day}>
                        <span className="dow nb-p">{dayOfWeekShort(d)}</span>
                        <span className="dow nb-w">{d === today ? "Сегодня" : dayOfWeekShort(d)}</span>
                        <span className="num">{dayNumber(d)}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="nb-l nb-l-post">Пост</div>
                  <div className="seg">
                    <Link href={href({ post: null, t: null })} aria-current={postNo === null ? "page" : undefined}>
                      <span className="nb-p">Любой</span><span className="nb-w">Любой пост</span>
                    </Link>
                    {Array.from({ length: schedule.posts }, (_, i) => i + 1).map(p => (
                      <Link key={p} href={href({ post: p, t: null })} aria-current={p === postNo ? "page" : undefined}>Пост {p}</Link>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="nb-l nb-l-slots">
                    <span>Свободные окна</span>
                    <span className="nb-l-s">
                      {postNo ? `пост ${postNo}` : "по всем постам"}
                      <span className="nb-w"> · шаг {schedule.stepMin} мин</span>
                    </span>
                  </div>
                  {slots.length === 0 ? (
                    <p className="hint">Свободных окон в этот день нет.</p>
                  ) : (
                    <div className="slots">
                      {slots.map(s => (
                        <Link key={s.hhmm} className="slot" href={href({ t: s.hhmm })} aria-pressed={s.hhmm === time} title={`пост ${s.postNo}`}>
                          {s.hhmm}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="nb-who">
                <div className="summary">
                  <div className="l"><b>{svc.title}</b><i>{formatRub(svc.price)}</i></div>
                  <div className="s">{when}</div>
                </div>
                <div className="nb-fields">
                  <label className="fld"><span>Имя</span><input name="name" required maxLength={80} autoComplete="off" /></label>
                  <label className="fld"><span>Телефон</span><input name="phone" inputMode="tel" placeholder="+7 940 000-00-00" /></label>
                  <label className="fld"><span>Машина</span><input name="vehicle" maxLength={80} placeholder="Toyota Camry 2015, А123АВ" /></label>
                  <label className="fld"><span>Комментарий</span><textarea name="comment" maxLength={500} placeholder="что просил клиент" /></label>
                </div>
              </div>
            </div>
          </div>

          <div className="nb-foot sticky-actions">
            <div className="nb-total">
              <div className="nb-total-t">{svc.title}</div>
              <div className="nb-total-s">{when}</div>
            </div>
            <div className="nb-total-p">{formatRub(svc.price)}</div>
            {step > 0 && (
              <Link className="aui-btn aui-btn--outline aui-btn--lg btn-sq nb-back" href={href({ step: step - 1 })} aria-label="Назад">
                <Icon name="chevron" size={18} />
              </Link>
            )}
            <Link className="aui-btn aui-btn--outline aui-btn--md nb-cancel" href={`/segodnya?d=${day}`}>Отмена</Link>
            <Link className="aui-btn aui-btn--primary aui-btn--lg nb-next" href={href({ step: Math.min(2, step + 1) })}>Далее</Link>
            <button className="aui-btn aui-btn--primary aui-btn--lg nb-submit" type="submit">Записать</button>
          </div>
        </form>
      </div>
    </>
  );
}
