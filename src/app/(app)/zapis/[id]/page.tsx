import Link from "next/link";
import { notFound } from "next/navigation";
import { transitionAction } from "@/app/(app)/actions";
import { clientName, vehicleLine } from "@/components/BookingRow";
import { MasterPick } from "@/components/MasterPick";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { StatusBadge } from "@/components/Status";
import { countPending, getBooking, listBookings, recentBookings } from "@/lib/bookings";
import { Timeline } from "@/components/Timeline";
import { clientKey } from "@/lib/clients";
import { count, formatPhone, formatRub, initials, minutesLabel, relativeAt, rub, timeRange } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { can } from "@/lib/access";
import { fetchInspection } from "@/lib/api/inspections";
import { requireSection } from "@/lib/context";
import { countBySeverity, inspectionState, untouchedNodeKeys } from "@/lib/inspection";
import { addDays } from "@/lib/format";
import { localDay, localTime } from "@/lib/sto/slots";
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
  const b = await getBooking(shop.id, bookingId);
  if (!b) notFound();

  const day = isDay(pick(sp.d)) ? pick(sp.d) : localDay(new Date(b.starts_at));
  const backHref = `/segodnya?d=${day}`;
  // Свой адрес: день таскаем с собой, иначе «назад» уведёт в сегодняшний день.
  const self = (q = "") => `/zapis/${b.id}?d=${day}${q}`;
  const pending = await countPending(shop.id);

  const trans = shopTransitions(b.status);
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
  const key = clientKey(b);
  // «N записей» считаем по всем записям сервиса: таблицы клиентов нет, они
  // собираются из снимков — то же правило, что на экране клиентов.
  const visits = (await recentBookings(shop.id)).filter(r => clientKey(r) === key).length;
  const car = vehicleLine(b);
  const plate = b.data.vehicle?.plate ?? null;

  // За ящиком на вебе — сетка того же дня: запись видно в контексте смены,
  // и соседнюю можно открыть, не возвращаясь назад. На телефоне её нет.
  const dayRows = await listBookings(shop.id, localTime(day, "00:00"), localTime(addDays(day, 1), "00:00"));
  const posts = shop.schedule?.posts ?? Math.max(1, ...dayRows.map(r => r.post_no));

  const act = pick(sp.do);
  const reason = /^[0-3]$/.test(pick(sp.r)) ? Number(pick(sp.r)) : -1;

  // Осмотр при приёмке: счётчики из осмотра, если он есть. not_found — осмотр
  // ещё не начат, это обычное состояние, а не ошибка.
  const showInspect = can(ctx.role, "inspect");
  const insp = showInspect ? await fetchInspection({ shopId: shop.id, actorUserId: ctx.userId, bookingId: b.id }) : null;
  const inspection = insp?.ok ? insp.data : null;
  const inspErr = insp && !insp.ok && insp.code !== "not_found" ? insp.error : "";
  const sev = countBySeverity(inspection?.defects ?? []);

  return (
    <>
      <ScreenHead title={`Запись № ${b.id}`} sub={b.service.title} back={backHref} unread={pending} />
      <div className="page board behind">
        <div className="card tl-wrap">
          <Timeline
            rows={dayRows}
            schedule={shop.schedule}
            posts={posts}
            day={day}
            now={new Date()}
            newHref={(postNo, hhmm) => `/kalendar/novaya?d=${day}&post=${postNo}&hhmm=${hhmm}`}
          />
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
            </div>
            <div className="bd-svc">
              <div>
                <div className="bd-svc-t">{b.service.title}</div>
                <div className="bd-svc-s">{prepayLine}</div>
              </div>
              <div className="bd-svc-p">{formatRub(b.service.price)}</div>
            </div>
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
            <Link className="person-link" href={`/klienty/${key}`}>
              Карточка клиента и машины <Icon name="arrowRight" size={15} />
            </Link>
          </div>

          {car && (
            <div className="card thing">
              <span className="sq"><Icon name="car" size={24} /></span>
              <div className="row-main">
                <div className="thing-n">{car}</div>
                {plate && <div className="thing-s">{plate}</div>}
              </div>
            </div>
          )}

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
              <Link className="aui-btn aui-btn--primary aui-btn--lg" href="/kalendar/novaya">Записать снова</Link>
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
