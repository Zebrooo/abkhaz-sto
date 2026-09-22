import Link from "next/link";
import { notFound } from "next/navigation";
import { addExtraAction, delayAction, transitionAction } from "@/app/(app)/actions";
import { ExtraPick } from "@/components/ExtraPick";
import { bookingPrice, delayedMin } from "@/lib/booking-extras";
import { DELAY_CHOICES } from "@/lib/delay";
import { listServices } from "@/lib/services";
import { clientName, vehicleLine } from "@/components/BookingRow";
import { MasterPick } from "@/components/MasterPick";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { StatusBadge } from "@/components/Status";
import { countClientVisits, countPending, dayBookings, getBooking } from "@/lib/bookings";
import { ensureBookingVin } from "@/lib/vin-history";
import { BookingVin } from "@/components/BookingVin";
import { Timeline } from "@/components/Timeline";
import { clientKey } from "@/lib/clients";
import { count, formatPhone, formatRub, initials, minutesLabel, relativeAt, rub, timeRange } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { can } from "@/lib/access";
import { fetchInspection } from "@/lib/api/inspections";
import { requireSection } from "@/lib/context";
import { countBySeverity, inspectionState, untouchedNodeKeys } from "@/lib/inspection";
import { localDay, localHHMM } from "@/lib/sto/slots";
import { vehicleKey } from "@/lib/vehicles";
import { canReschedule, shopTransitions, type StoTransition } from "@/lib/sto/transitions";
import type { StoBookingRow, StoBookingStatus, StoPrepayStatus } from "@/lib/sto/types";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Сколько шагов истории уже позади — по текущему статусу. */
const PASSED: Record<StoBookingStatus, number> = { new: 1, confirmed: 2, done: 3, no_show: 3, cancelled: 2 };

const PREPAY_AT: Record<StoPrepayStatus, string> = {
  none: "ещё не внесена",
  held: "держится на сайте",
  released_to_shop: "ушла сервису",
  refunded: "вернулась клиенту",
};

/** Готовые причины отмены: их видит клиент, поэтому формулировки общие. */
const REASONS = ["Мастер заболел", "Сломался подъёмник", "Нет запчасти", "Клиент попросил"];

const CANCEL_FORM = "zapis-cancel";

/** Скрытые поля перехода — их ждёт transitionAction от каждой формы. */
function TransitionFields({ b, transition, back }: { b: StoBookingRow; transition: StoTransition; back: string }) {
  return (
    <>
      <input type="hidden" name="shopId" value={b.shop_id} />
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="transition" value={transition} />
      <input type="hidden" name="return" value={back} />
    </>
  );
}

/**
 * Карточка записи: время и пост, история статуса, клиент, машина, комментарий
 * и действия. На телефоне — экран со шторками, на вебе — ящик справа; разметка
 * одна, разводит её CSS. Действия открываются параметром `do` в адресе, чтобы
 * обойтись без клиентского состояния.
 */
export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) notFound();
  const ctx = await requireSection("bookings");
  if (!ctx) return null;
  const shop = ctx.shop;
  const fetched = await getBooking(shop.id, bookingId);
  if (!fetched) notFound();

  const day = isDay(pick(sp.d)) ? pick(sp.d) : localDay(new Date(fetched.starts_at));
  const backHref = `/segodnya?d=${day}`;
  // Ключ клиента от VIN не зависит (учётка → телефон → имя, lib/clients.ts),
  // поэтому считается до добора VIN — и добор встаёт в общую пачку ниже.
  const key = clientKey(fetched);
  const showInspect = can(ctx.role, "inspect");
  const act = pick(sp.do);
  // Всё независимое — одной пачкой: добор VIN из истории, колокол, счётчик
  // визитов клиента, сетка дня за ящиком и осмотр при приёмке друг друга не ждут.
  const [b, pending, visits, dayRows, insp, priceList] = await Promise.all([
    // VIN добираем из истории клиента сами; не нашёлся — ниже появится блок
    // «VIN не указан» (спека abkhaz-auto 2026-09-22-sto-booking-garage-vin).
    ensureBookingVin(shop.id, fetched),
    countPending(shop.id),
    // «N записей» — точечным счётчиком по ключу клиента: таблицы клиентов
    // нет, они собираются из снимков — то же правило, что на экране клиентов.
    countClientVisits(shop.id, key),
    dayBookings(shop.id, day),
    // not_found — осмотр ещё не начат, это обычное состояние, а не ошибка.
    showInspect ? fetchInspection({ shopId: shop.id, actorUserId: ctx.userId, bookingId: fetched.id }) : Promise.resolve(null),
    // Прайс нужен только открытой шторке «Добавить услугу».
    act === "extra" ? listServices(shop.id) : Promise.resolve([]),
  ]);
  // Свой адрес: день таскаем с собой, иначе «назад» уведёт в сегодняшний день.
  const self = (q = "") => `/zapis/${b.id}?d=${day}${q}`;

  // Отмена и «не приехал» — разговор с клиентом, и ведёт его стойка: мастеру
  // эти кнопки не показываем (access.ts, closeBooking). «Выполнено» и
  // «Подтвердить» у него остаются — это про работу, а не про клиента.
  const mayClose = can(ctx.role, "closeBooking");
  const trans = shopTransitions(b.status).filter(t => mayClose || (t !== "cancel" && t !== "no_show"));
  const canMove = canReschedule(b.status);
  const hasActions = canMove || trans.includes("no_show") || trans.includes("cancel");
  const primary: { label: string; transition: StoTransition } | null =
    b.status === "new" ? { label: "Подтвердить запись", transition: "confirm" }
      : b.status === "confirmed" ? { label: "Выполнено", transition: "done" }
        : null;

  const source = b.source === "site" ? "с сайта" : "вручную";
  const durationMin = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  const prepayLine = b.prepay_amount > 0
    ? `предоплата ${rub(b.prepay_amount)} · ${PREPAY_AT[b.prepay_status]}`
    : "без предоплаты";

  // История статуса. Точных моментов в строке два — создание и последняя
  // правка; промежуточный пройденный шаг остаётся без времени, придумывать
  // его не из чего.
  const passed = PASSED[b.status];
  const steps = [
    { t: "Создана", at: `${relativeAt(b.created_at)} · ${source}` },
    { t: b.status === "cancelled" ? "Отменена" : "Подтверждена", at: passed > 1 ? "" : "ждёт вас" },
    { t: b.status === "no_show" ? "Клиент не приехал" : "Выполнена", at: passed > 2 ? "" : "после работы" },
  ];
  if (passed > 1) steps[passed - 1].at = relativeAt(b.updated_at);

  const name = clientName(b);
  const phone = normalizePhone(b.data.client?.phone);
  const car = vehicleLine(b);
  const plate = b.data.vehicle?.plate ?? null;
  // Номер и VIN — под названием машины: по ним сверяют, ту ли машину приняли,
  // и их же называют по телефону. VIN показываем целиком: половина VIN не
  // опознаёт ничего.
  const carSub = [plate, b.data.vehicle?.vin ? `VIN ${b.data.vehicle.vin}` : null].filter(Boolean).join(" · ");
  // У машины своя карточка: что ей делали, на сколько и кто на ней ездил.
  const carKey = vehicleKey(b.data.vehicle);
  // «Записать снова» открывает форму с тем же человеком, той же машиной и той
  // же услугой: этот клиент только что стоял перед вами, набирать его заново
  // незачем.
  const againHref = (() => {
    const q = new URLSearchParams({ d: day, client: key });
    if (carKey) q.set("car", carKey);
    if (b.listing_id) q.set("s", String(b.listing_id));
    return `/kalendar/novaya?${q.toString()}`;
  })();


  // За ящиком на вебе — сетка того же дня: запись видно в контексте смены,
  // и соседнюю можно открыть, не возвращаясь назад. На телефоне её нет.
  const posts = shop.schedule?.posts ?? Math.max(1, ...dayRows.map(r => r.post_no));

  const reason = /^[0-3]$/.test(pick(sp.r)) ? Number(pick(sp.r)) : -1;

  // Живую запись можно дополнить услугой и продлить — по ходу работы.
  const extras = b.data.extras ?? [];
  const delayed = delayedMin(b);
  const total = bookingPrice(b);

  // Осмотр при приёмке: счётчики из осмотра, если он есть.
  const inspection = insp?.ok ? insp.data : null;
  const inspErr = insp && !insp.ok && insp.code !== "not_found" ? insp.error : "";
  const sev = countBySeverity(inspection?.defects ?? []);

  return (
    <>
      <ScreenHead title={`Запись № ${b.id}`} sub={b.service.title} back={backHref} unread={pending} />
      <div className="page board behind">
        <div className="card tl-wrap">
          <Timeline rows={dayRows} schedule={shop.schedule} posts={posts} day={day} now={new Date()} shopId={shop.id} returnTo={backHref} />
        </div>
      </div>
      <Link className="scrim behind-scrim" href={backHref} aria-label="Закрыть запись" />
      <div className="detail">
        <div className="detail-head">
          <div className="row-main">
            <div className="h-title">Запись № {b.id}</div>
            <div className="h-sub">{source} · создана {relativeAt(b.created_at)}</div>
          </div>
          <Link className="detail-close" href={backHref} aria-label="Закрыть">
            <span><Icon name="plus" size={18} /></span>
          </Link>
        </div>

        <div className="page detail-body stack">
          <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

          <div className="card">
            <div className="bd-head">
              <StatusBadge status={b.status} />
              <span className="bd-no">№ {b.id}</span>
            </div>
            <div className="bd-time">{timeRange(b.starts_at, b.ends_at)}</div>
            <div className="bd-chips">
              <span className="rspec is-accent">пост {b.post_no}</span>
              <MasterPick bookingId={b.id} postNo={b.post_no} day={day} open={act === "master"} selfHref={self()} />
              <span className="rspec">{minutesLabel(durationMin)}</span>
              <span className="rspec">{source}</span>
              {delayed > 0 && <span className="rspec is-late">задержка +{delayed} мин</span>}
            </div>
            <div className="bd-svc">
              <div>
                <div className="bd-svc-t">{b.service.title}</div>
                <div className="bd-svc-s">{prepayLine}</div>
              </div>
              <div className="bd-svc-p">{formatRub(b.service.price)}</div>
            </div>
            {extras.map((e, i) => (
              // Индекс в ключе: две услуги могут добавиться в одну секунду.
              <div key={`${e.at}-${i}`} className="bd-svc bd-extra">
                <div>
                  <div className="bd-extra-t">{e.title}</div>
                  <div className="bd-svc-s">добавлена по ходу работы · {relativeAt(e.at)}</div>
                </div>
                <div className="bd-extra-p">{formatRub(e.price)}</div>
              </div>
            ))}
            {extras.length > 0 && (
              <div className="bd-svc">
                <div className="bd-svc-t">Итого</div>
                <div className="bd-svc-p">{formatRub(total)}</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="steps">
              {steps.map((s, i) => (
                <div key={s.t} className={i < passed ? "step on" : "step"}>
                  <div className="step-rail"><span className="step-dot" /><span className="step-line" /></div>
                  <div className="step-body">
                    <div className="step-t">{s.t}</div>
                    {s.at && <div className="step-at">{s.at}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="person">
              <span className="ava ava-accent">{initials(name)}</span>
              <div className="row-main">
                <div className="person-n">{name}</div>
                <div className="person-s">{phone ? `${formatPhone(phone)} · ` : ""}{count(visits, "запись", "записи", "записей")}</div>
              </div>
            </div>
            {phone && (
              <div className="person-actions">
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={`tel:${phone}`}>
                  <Icon name="phone" size={16} />Позвонить
                </a>
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={`sms:${phone}`}>
                  <Icon name="comment" size={16} />Написать
                </a>
              </div>
            )}
            {/* Карточка клиента лежит в закрытом мастеру разделе: ссылка,
                которая молча уводит его на «Мой пост», хуже, чем её отсутствие. */}
            {can(ctx.role, "clients") && (
              <Link className="person-link" href={`/klienty/${key}`}>
                Карточка клиента и машины <Icon name="arrowRight" size={15} />
              </Link>
            )}
          </div>

          {car && (carKey && can(ctx.role, "clients") ? (
            <Link className="card thing" href={`/mashiny/${carKey}`}>
              <span className="sq"><Icon name="car" size={24} /></span>
              <div className="row-main">
                <div className="thing-n">{car}</div>
                {carSub && <div className="thing-s">{carSub}</div>}
              </div>
              <Icon name="chevron" size={16} />
            </Link>
          ) : (
            <div className="card thing">
              <span className="sq"><Icon name="car" size={24} /></span>
              <div className="row-main">
                <div className="thing-n">{car}</div>
                {carSub && <div className="thing-s">{carSub}</div>}
              </div>
            </div>
          ))}

          {/* VIN не нашёлся ни в снимке, ни в истории — просим вписать с
              кузова. Блок, а не гейт: работе он не мешает. */}
          {!b.data.vehicle?.vin && <BookingVin shopId={shop.id} bookingId={b.id} returnTo={self()} />}

          {showInspect && (
            <div className="card">
              <div className="bd-head">
                <div className="card-t">Осмотр при приёмке</div>
                <span className="bd-no">{inspection ? inspectionState(inspection.defects.length).title : "не начат"}</span>
              </div>
              {inspection ? (
                <div className="rp-badges">
                  <span className="aui-badge">{sev.bad} критично</span>
                  <span className="aui-badge is-tag-urgent">{sev.warn} внимание</span>
                  <span className="aui-badge is-tag-free">{untouchedNodeKeys(inspection.defects).length} норма</span>
                </div>
              ) : (
                <div className="card-s">{inspErr || "Пробег, найденные дефекты с фото — и отчёт клиенту соберётся сам."}</div>
              )}
              <div className="ins-bk-b">
                <Link className="aui-btn aui-btn--secondary aui-btn--md" href={`/zapis/${b.id}/osmotr?d=${day}`}>
                  {inspection ? "Продолжить осмотр" : "Начать осмотр"}
                </Link>
                {inspection && <Link className="aui-btn aui-btn--outline aui-btn--md" href={`/zapis/${b.id}/otchet?d=${day}`}>Отчёт</Link>}
              </div>
            </div>
          )}

          {b.data.comment && (
            <div className="card-warm">
              <div className="eyebrow eyebrow-accent">Комментарий клиента</div>
              <div className="cmt">«{b.data.comment}»</div>
            </div>
          )}

          <div className="sticky-actions detail-foot">
            {primary ? (
              <form action={transitionAction}>
                <TransitionFields b={b} transition={primary.transition} back={self()} />
                <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit">{primary.label}</button>
              </form>
            ) : (
              <Link className="aui-btn aui-btn--primary aui-btn--lg" href={againHref}>Записать снова</Link>
            )}
            {hasActions && (
              <Link className="aui-btn aui-btn--outline aui-btn--lg btn-sq" href={self("&do=1")} aria-label="Другие действия">
                <Icon name="menu" size={20} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {act === "1" && hasActions && (
        <Sheet
          closeHref={self()}
          title="Действия с записью"
          sub={`№ ${b.id}`}
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Закрыть</Link>}
        >
          <div className="act-list">
            {canMove && <Link className="act" href={self("&do=extra")}>Добавить услугу к записи</Link>}
            {canMove && <Link className="act" href={self("&do=delay")}>Нужно больше времени</Link>}
            {canMove && <Link className="act" href={`/kalendar?d=${day}&move=${b.id}`}>Перенести на другое окно</Link>}
            {trans.includes("no_show") && (
              <form action={transitionAction}>
                <TransitionFields b={b} transition="no_show" back={self()} />
                <button className="act" type="submit">Клиент не приехал</button>
              </form>
            )}
            {trans.includes("cancel") && <Link className="act act-danger" href={self("&do=cancel")}>Отменить запись</Link>}
          </div>
        </Sheet>
      )}

      {act === "extra" && canMove && (
        <Sheet
          closeHref={self()}
          backHref={self("&do=1")}
          title="Добавить услугу"
          sub={`№ ${b.id} · ${b.service.title}`}
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Закрыть</Link>}
        >
          <div className="sheet-note">
            Мастер нашёл ещё работу — услуга добавится к записи и в деньги по цене прайса.
            Время записи не изменится: если работа дольше, есть «Нужно больше времени».
          </div>
          {/* Кнопки услуг отправляют эту форму своим listingId. */}
          <form action={addExtraAction} className="sheet-stack">
            <input type="hidden" name="shopId" value={b.shop_id} />
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="return" value={self()} />
            <ExtraPick items={priceList.map(s => ({
              listingId: s.listingId,
              title: s.title,
              sub: `${formatRub(s.price)} · ${minutesLabel(s.durationMin)}`,
            }))} />
          </form>
          {priceList.length === 0 && <p className="hint">В прайсе нет услуг — они заводятся в кабинете витрины на сайте.</p>}
        </Sheet>
      )}

      {act === "delay" && canMove && (
        <Sheet
          closeHref={self()}
          backHref={self("&do=1")}
          title="Нужно больше времени"
          sub={`№ ${b.id} · сейчас до ${localHHMM(new Date(b.ends_at))}`}
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Закрыть</Link>}
        >
          <div className="sheet-note">
            Запись станет длиннее, а записи следом на этом посту сдвинутся.
            Их клиенты получат уведомление: запись смещена, приносим извинения,
            время можно перенести.
          </div>
          <div className="delay-chips">
            {DELAY_CHOICES.map(m => (
              <form key={m} action={delayAction}>
                <input type="hidden" name="shopId" value={b.shop_id} />
                <input type="hidden" name="bookingId" value={b.id} />
                <input type="hidden" name="minutes" value={m} />
                <input type="hidden" name="return" value={self()} />
                <button className="aui-btn aui-btn--secondary aui-btn--lg" type="submit">+{m} мин</button>
              </form>
            ))}
          </div>
        </Sheet>
      )}

      {act === "cancel" && trans.includes("cancel") && (
        <Sheet
          closeHref={self()}
          backHref={self("&do=1")}
          title="Отмена записи"
          sub={`№ ${b.id} · ${b.service.title}`}
          footer={
            <>
              <Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Не отменять</Link>
              <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={CANCEL_FORM}>Отменить запись</button>
            </>
          }
        >
          <div className="act-list">
            <div className="sheet-note">Причину увидит клиент в своей записи и в уведомлении. Предоплата вернётся ему на кошелёк сайта.</div>
            {REASONS.map((r, i) => (
              <Link key={r} className="reason" href={self(`&do=cancel&r=${i}`)} aria-pressed={i === reason}>{r}</Link>
            ))}
          </div>
          {/* Форма живёт в теле, а кнопка — в подвале шторки: их связывает form=. */}
          <form id={CANCEL_FORM} action={transitionAction}>
            <TransitionFields b={b} transition="cancel" back={self()} />
            {reason >= 0
              ? <input type="hidden" name="reason" value={REASONS[reason]} />
              : <textarea className="reason-other" name="reason" placeholder="Другая причина" />}
          </form>
        </Sheet>
      )}
    </>
  );
}
