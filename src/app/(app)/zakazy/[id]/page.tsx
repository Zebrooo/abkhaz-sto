import Link from "next/link";
import { notFound } from "next/navigation";
import { extendReserveAction, saveOrderNoteAction, transitionOrderAction } from "@/app/(app)/goods-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pill, Pills } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { Thumb } from "@/components/Thumb";
import { fetchGoodsOrder, type GoodsOrderOut } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { count, dayShort, formatPhone, initials, relativeAt, rub } from "@/lib/format";
import {
  ACTION_SHEET, actionsFor, canCancel, handoverWhen, orderPills, PAYMENT_LABEL, phoneDigits, SOURCE_LABEL, statusPill,
  VIEW_OF_STATUS, whatsappUrl, whenLabel, type OrderAction,
} from "@/lib/goods/orders";
import { listingUrl, shopStorefrontUrl } from "@/lib/site";
import { localDay, localHHMM } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const FORM = "order-form";
const RESERVE_DAYS = [1, 2, 3, 7];

/** Кнопка перехода: прямая форма или ссылка в шторку, если действию нужно больше одной кнопки. */
function ActionButton({ a, o, self, cls }: { a: OrderAction; o: GoodsOrderOut; self: (q?: string) => string; cls: string }) {
  if (a.needs !== "none") return <Link className={cls} href={self(`?do=${ACTION_SHEET[a.needs]}`)}>{a.label}</Link>;
  return (
    <form action={transitionOrderAction}>
      <input type="hidden" name="orderId" value={o.id} />
      <input type="hidden" name="status" value={a.status} />
      {a.paid && <input type="hidden" name="paid" value="1" />}
      <input type="hidden" name="return" value={self()} />
      <button className={cls} type="submit">{a.label}</button>
    </form>
  );
}

/** Время сборки по умолчанию — через час: за меньшее букет не собрать, а точное время всё равно правят. */
function defaultReadyBy(now: Date): string {
  return localHHMM(new Date(now.getTime() + 3_600_000));
}

/**
 * Карточка заказа — один шаблон на обе вертикали, различается набор полей
 * (артборд «Заказ · цветы» и «Заказ · электроника»): цветам — что собрать,
 * получатель, окно, открытка; электронике — наличие, резерв, гарантия и
 * серийник при выдаче. Переходы — шторками по адресу (?do=), действия —
 * серверные; сообщение клиенту после перехода приходит в ?msg= и
 * открывается в WhatsApp кнопкой: из серверного действия wa.me не открыть.
 */
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const res = await fetchGoodsOrder({ shopId: shop.id, actorUserId: ctx.userId, orderId });
  if (!res.ok && res.code === "not_found") notFound();
  if (!res.ok) {
    return (
      <>
        <ScreenHead title={`Заказ № ${orderId}`} back="/zakazy" />
        <div className="page page-narrow stack">
          <div className="head"><div><div className="head-t">Заказ № {orderId}</div></div></div>
          <Flash err={res.error} title="Заказ не загрузился" />
          <Link className="aui-btn aui-btn--outline aui-btn--md" href="/zakazy">К заказам</Link>
        </div>
      </>
    );
  }

  const o = res.data;
  const now = new Date();
  const self = (q = "") => `/zakazy/${o.id}${q}`;
  const backHref = `/zakazy?v=${VIEW_OF_STATUS[o.status]}`;
  const act = pick(sp.do);
  const msg = pick(sp.msg);
  const err = pick(sp.err);
  const created = new Date(o.createdAt);
  const sub = `${SOURCE_LABEL[o.source]} · ${dayShort(localDay(created))} · ${localHHMM(created)}`;
  const electronics = o.goods.vertical === "electronics";
  const flowers = o.goods.vertical === "flowers";
  const digits = phoneDigits(o.buyer.phone);
  const wa = whatsappUrl(o.buyer.phone);
  const waMsg = whatsappUrl(o.buyer.phone, msg);
  const actions = actionsFor(o);
  const active = actions.length > 0 || canCancel(o);
  // Получатель цветов — отдельный блок только когда это другой человек.
  const r = o.goods.recipient;
  const recipient = r && (r.name !== o.buyer.name || (r.phone ?? null) !== (o.buyer.phone ?? null)) ? r : null;
  const title = flowers ? "Что собрать" : electronics ? "Товар" : "Состав заказа";

  return (
    <>
      <ScreenHead title={`Заказ № ${o.number}`} sub={sub} back={backHref} />
      <div className="page page-narrow page-card stack">
        <div className="head">
          <div>
            <div className="head-t">Заказ № {o.number}</div>
            <div className="head-s">{sub}</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--outline aui-btn--md" href={backHref}>Все заказы</Link>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={act ? "" : err} />

        {msg && waMsg && (
          <div className="card-warm wa-card">
            <div className="eyebrow eyebrow-accent">Сообщение клиенту</div>
            <div className="msg-txt">{msg}</div>
            <a className="aui-btn aui-btn--primary aui-btn--md" href={waMsg} target="_blank" rel="noreferrer">Открыть WhatsApp</a>
            <p className="hint">
              {o.buyer.hasAccount
                ? "Клиент с учёткой уже получил уведомление сайта — WhatsApp по желанию."
                : "У клиента нет учётки на сайте: сайт ему не пишет, сообщение уходит из вашего WhatsApp."}
            </p>
          </div>
        )}

        <Pills specs={[statusPill(o, now), ...orderPills(o, now)]} />

        <div className="card">
          <div className="lbl">{title}</div>
          <div className="stack" style={{ marginTop: 8 }}>
            {o.items.map(it => (
              <div key={it.listingId} className="oi" style={{ padding: "8px 0" }}>
                <Thumb src={it.img} alt={it.title} size={48} />
                <div className="row-main">
                  <div className="oi-t">{it.title}</div>
                  <div className="oi-s">
                    {it.qty} × {rub(it.price)}
                    {it.warrantyMonths != null && ` · гарантия ${count(it.warrantyMonths, "месяц", "месяца", "месяцев")}`}
                    {electronics && (it.serial ? ` · S/N ${it.serial}` : " · S/N при выдаче")}
                    {" · "}<a href={listingUrl(it.slug)} target="_blank" rel="noreferrer">на сайте</a>
                  </div>
                </div>
                <div className="oi-tail price">{rub(it.price * it.qty)}</div>
              </div>
            ))}
          </div>
          {o.goods.composition && <div className="kv"><span className="kv-k">Состав</span><span className="kv-v">{o.goods.composition}</span></div>}
          {o.goods.card && <div className="kv"><span className="kv-k">Открытка</span><span className="kv-v">«{o.goods.card}»</span></div>}
          {o.comment && <div className="kv"><span className="kv-k">Комментарий</span><span className="kv-v">{o.comment}</span></div>}
        </div>

        <div className="card">
          <div className="lbl">Покупатель</div>
          <div className="person" style={{ marginTop: 10 }}>
            <span className="ava ava-accent">{initials(o.buyer.name)}</span>
            <div className="row-main">
              <div className="person-n">{o.buyer.name}</div>
              <div className="person-s">
                {o.clientOrdersCount > 1 ? `заказывает ${o.clientOrdersCount}-й раз` : "первый заказ"}
                {o.buyer.hasAccount ? " · с сайта" : " · без учётки"}
              </div>
              {o.buyer.phone && <div className="gcard-who">{formatPhone(o.buyer.phone)}</div>}
            </div>
          </div>
          <div className="person-actions">
            {digits && <a className="aui-btn aui-btn--secondary aui-btn--md" href={`tel:+${digits}`}>Позвонить</a>}
            {wa && <a className="aui-btn aui-btn--secondary aui-btn--md" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
          {o.buyer.phone && (
            <Link className="person-link" href={`/pokupateli?q=${encodeURIComponent(o.buyer.phone)}`}>
              Карточка клиента<Icon name="arrowRight" size={14} />
            </Link>
          )}
        </div>

        {recipient && (
          <div className="card">
            <div className="lbl">Получатель</div>
            <div className="person" style={{ marginTop: 10 }}>
              <span className="ava">{initials(recipient.name)}</span>
              <div className="row-main">
                <div className="person-n">{recipient.name}</div>
                {recipient.phone && <div className="gcard-who">{formatPhone(recipient.phone)}</div>}
              </div>
            </div>
            {phoneDigits(recipient.phone) && (
              <div className="person-actions">
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={`tel:+${phoneDigits(recipient.phone)}`}>Позвонить</a>
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={whatsappUrl(recipient.phone)!} target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="lbl">{o.method === "courier" ? "Доставка" : "Получение"}</div>
          <div className="seg" style={{ marginTop: 10 }}>
            <span aria-current={o.method === "courier" ? "page" : undefined}>Доставка</span>
            <span aria-current={o.method === "pickup" ? "page" : undefined}>Самовывоз</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="kv"><span className="kv-k">Когда</span><span className="kv-v">{handoverWhen(o, now) ?? "время не задано"}</span></div>
            {o.method === "courier" ? (
              <>
                <div className="kv"><span className="kv-k">Адрес</span><span className="kv-v">{o.address ?? "не указан"}</span></div>
                <div className="kv"><span className="kv-k">Доставка</span><span className="kv-v">{o.delivery > 0 ? rub(o.delivery) : "бесплатно"}</span></div>
                {o.courier && <div className="kv"><span className="kv-k">Курьер</span><span className="kv-v">{o.courier.name}{o.courier.phone ? ` · ${formatPhone(o.courier.phone)}` : ""}{o.courier.own ? "" : " · площадки"}</span></div>}
              </>
            ) : (
              o.pickup && <div className="kv"><span className="kv-k">Где</span><span className="kv-v">{o.pickup.address}{o.pickup.hours ? ` · ${o.pickup.hours}` : ""}</span></div>
            )}
            {o.reserveUntil && (
              <div className="kv">
                <span className="kv-k">Резерв до</span>
                <span className="kv-v">{whenLabel(o.reserveUntil, now)}{o.reserveExpired && <> <Pill spec={{ text: "истёк", tone: "dng" }} /></>}</span>
              </div>
            )}
          </div>
          {electronics && active && (
            <Link className="aui-btn aui-btn--outline aui-btn--sm" href={self("?do=reserve")} style={{ marginTop: 12 }}>Продлить резерв</Link>
          )}
        </div>

        <div className="card">
          <div className="split">
            <div>
              <div className="lbl">Итого</div>
              <div className="lbl-s">товары {rub(o.subtotal)}{o.delivery > 0 ? ` · доставка ${rub(o.delivery)}` : ""}</div>
            </div>
            <div className="total">{rub(o.total)}</div>
          </div>
          <div className="kv" style={{ marginTop: 8 }}>
            <span className="kv-k">Оплата</span>
            <span className="kv-v">
              {o.paidAt
                ? <Pill spec={{ text: `оплачен · ${whenLabel(o.paidAt, now)}`, tone: "ok" }} />
                : <Pill spec={{ text: PAYMENT_LABEL[o.payment], tone: "warn" }} />}
            </span>
          </div>
        </div>

        <Link className="card-warm note-card" href={self("?do=note")}>
          <div className="eyebrow eyebrow-accent">Заметка к заказу</div>
          <div className={`note-txt${o.goods.note ? "" : " note-empty"}`}>
            {o.goods.note ?? "Что помнить по этому заказу: звонить заранее, оставить у консьержа. Нажмите, чтобы записать."}
          </div>
        </Link>

        <p className="hint">создан {relativeAt(o.createdAt, now)} · статус менялся {relativeAt(o.updatedAt, now)}</p>

        {/* Второстепенные переходы («Курьеру» рядом с «Готов», «Доставлен» рядом
            с «Курьеру») — своей строкой: в липкой панели телефона три кнопки
            не помещаются, а главное действие должно оставаться одной большой. */}
        {actions.length > 1 && (
          <div className="gcard-actions">
            {actions.slice(1).map(a => <ActionButton key={a.status} a={a} o={o} self={self} cls="aui-btn aui-btn--outline aui-btn--md" />)}
          </div>
        )}

        {active && (
          <div className="sticky-actions">
            {canCancel(o) && <Link className="aui-btn aui-btn--outline aui-btn--lg" href={self("?do=cancel")}>Отказ</Link>}
            {actions[0] && <ActionButton a={actions[0]} o={o} self={self} cls="aui-btn aui-btn--primary aui-btn--lg" />}
          </div>
        )}
      </div>

      {act === "accept" && (
        <Sheet closeHref={self()} title="Принять заказ" sub={`№ ${o.number} · ${o.buyer.name}`}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Принять</button></>}>
          <form id={FORM} action={transitionOrderAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="status" value="assembling" />
            <input type="hidden" name="return" value={self("?do=accept")} />
            <label className="fld">
              <span>Собрать к</span>
              <input type="time" name="readyBy" defaultValue={defaultReadyBy(now)} required />
            </label>
            <p className="sheet-note">Время попадёт в сообщение клиенту: «принят, соберём к 10:00». Клиент с учёткой увидит статус у себя на сайте.</p>
          </form>
        </Sheet>
      )}

      {act === "courier" && (
        <Sheet closeHref={self()} title="Передать курьеру" sub={`№ ${o.number}${o.address ? ` · ${o.address}` : ""}`}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM} disabled={o.ownDelivery && shop.couriers.length === 0}>Курьеру</button></>}>
          <form id={FORM} action={transitionOrderAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="status" value="shipping" />
            <input type="hidden" name="return" value={self("?do=courier")} />
            {o.ownDelivery ? (
              shop.couriers.length === 0 ? (
                <div className="card card-accent">
                  <div className="note-t">Своих курьеров нет</div>
                  <div className="note-s">Магазин возит сам, а список курьеров пуст — сайт без курьера заказ не передаст. Добавьте курьеров в кабинете магазина на сайте.</div>
                  <a className="aui-btn aui-btn--outline aui-btn--sm" href={shopStorefrontUrl(shop.id)}>Открыть кабинет</a>
                </div>
              ) : (
                <div className="fld">
                  <span>Кто везёт</span>
                  <div className="chips chips-wrap">
                    {shop.couriers.map((c, i) => (
                      <label key={c.id} className="chip chip-radio">
                        <input type="radio" name="courierId" value={c.id} defaultChecked={i === 0} required />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <p className="sheet-note">Везёт курьер площадки — выбирать не нужно. Клиент получит сообщение «передан курьеру».</p>
            )}
          </form>
        </Sheet>
      )}

      {act === "deliver" && (
        <Sheet closeHref={self()} title={o.method === "pickup" ? "Выдать заказ" : "Заказ доставлен"} sub={`№ ${o.number} · ${rub(o.total)}`}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>{o.method === "pickup" ? "Выдан" : "Доставлен"}{o.paidAt ? "" : " и оплачен"}</button></>}>
          <form id={FORM} action={transitionOrderAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="status" value="delivered" />
            <input type="hidden" name="return" value={self("?do=deliver")} />
            {electronics && o.items.map(it => (
              <label key={it.listingId} className="fld">
                <span>Серийный номер · {it.title}</span>
                <input name={`serial_${it.listingId}`} defaultValue={it.serial ?? ""} maxLength={40} placeholder="с коробки или из «Об устройстве»" autoCapitalize="characters" />
              </label>
            ))}
            {electronics && <p className="sheet-note">Серийный номер попадёт в гарантийный талон клиента на сайте. Сканера в приложении нет — вводится руками.</p>}
            {!o.paidAt && (
              <label className="chk">
                <input type="checkbox" name="paid" value="1" defaultChecked />
                <span>Оплата получена<br /><span className="chk-s">{PAYMENT_LABEL[o.payment]} · {rub(o.total)}</span></span>
              </label>
            )}
            <p className="sheet-note">Остаток товара уменьшится сам, витрина обновится. Клиенту уйдёт чек-сообщение — с учёткой от сайта, без неё из вашего WhatsApp.</p>
          </form>
        </Sheet>
      )}

      {act === "reserve" && (
        <Sheet closeHref={self()} title="Продлить резерв" sub={o.reserveUntil ? `сейчас до ${whenLabel(o.reserveUntil, now)}` : "резерва пока нет"}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Продлить</button></>}>
          <form id={FORM} action={extendReserveAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="return" value={self("?do=reserve")} />
            <div className="fld">
              <span>На сколько</span>
              <div className="chips chips-wrap">
                {RESERVE_DAYS.map(d => (
                  <label key={d} className="chip chip-radio">
                    <input type="radio" name="days" value={d} defaultChecked={d === 2} />
                    {count(d, "день", "дня", "дней")}
                  </label>
                ))}
              </div>
            </div>
            <p className="sheet-note">Считается от сегодняшнего дня или от текущего срока — что позже. Истёкший резерв заказ не отменяет: решаете вы.</p>
          </form>
        </Sheet>
      )}

      {act === "note" && (
        <Sheet closeHref={self()} title="Заметка к заказу" sub={`№ ${o.number}`}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Сохранить</button></>}>
          <form id={FORM} action={saveOrderNoteAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="return" value={self("?do=note")} />
            <label className="fld">
              <span>Видит только магазин</span>
              <textarea name="note" defaultValue={o.goods.note ?? ""} maxLength={500} placeholder="Позвонить за полчаса. Оставить у консьержа." />
            </label>
            <p className="sheet-note">Пустая заметка стирается.</p>
          </form>
        </Sheet>
      )}

      {act === "cancel" && (
        <Sheet closeHref={self()} title="Отменить заказ" sub={`№ ${o.number} · ${o.buyer.name}`}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Не отменять</Link><button className="aui-btn aui-btn--danger aui-btn--lg" type="submit" form={FORM}>Отменить заказ</button></>}>
          <form id={FORM} action={transitionOrderAction} className="sheet-stack">
            {err && <Flash err={err} />}
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="status" value="cancelled" />
            <input type="hidden" name="return" value={self("?do=cancel")} />
            <label className="fld">
              <span>Причина — останется в заметке заказа</span>
              <textarea name="cancelReason" maxLength={300} placeholder="Клиент передумал. Нет в наличии." />
            </label>
            <p className="sheet-note">Отмена — насовсем: вернуть заказ нельзя, только завести новый. Клиент с учёткой увидит отмену на сайте{o.paidAt ? "; оплату возвращает сайт по своим правилам" : ""}.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
