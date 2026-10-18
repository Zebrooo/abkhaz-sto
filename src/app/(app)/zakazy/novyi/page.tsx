import Link from "next/link";
import { createOrderAction } from "@/app/(app)/goods-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { Thumb } from "@/components/Thumb";
import { fetchGoodsItems, fetchGoodsSettings, GOODS_PAYMENTS, type GoodsItemOut, type GoodsVertical } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { count, formatRub, rub } from "@/lib/format";
import { matchItem, stockPill } from "@/lib/goods/items";
import { ECHO_FIELDS, MAX_QTY, parseItemsParam, serializeItemsParam, withQty, type Picked } from "@/lib/goods/order-form";
import { PAYMENT_LABEL } from "@/lib/goods/orders";
import { shopStorefrontUrl } from "@/lib/site";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STEPS = [
  { title: "Товары", sub: "шаг 1 из 2 · что заказали" },
  { title: "Оформление", sub: "шаг 2 из 2 · клиент и получение" },
] as const;

const HEAD_SUB = "заказ по звонку · позиции только из объявлений магазина";
const RESERVE_DAYS = [1, 2, 3, 7];
const FORM = "new-order";

/** Сколько ещё можно взять: по остатку у «штук», иначе без потолка. */
function maxQty(item: GoodsItemOut): number {
  return item.stock?.mode === "count" ? item.stock.available : MAX_QTY;
}

/**
 * Заказ по звонку в два шага (артборд «Заказы»: «из звонка владелец заводит
 * сам»). Позиции и количество живут в адресе — степпер ссылками, экран
 * серверный, как ручная запись у сервиса; на втором шаге обычная форма.
 * Поля — по вертикали магазина: цветам получатель, окно и открытка,
 * электронике резерв и самовывоз по умолчанию. Сайт проверит остаток и
 * объявления сам и ответит по-русски; наш разбор ловит только то, без чего
 * он точно откажет (lib/goods/order-form.ts).
 */
export default async function NewOrderPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const [itemsRes, settingsRes] = await Promise.all([
    fetchGoodsItems({ shopId: shop.id, actorUserId: ctx.userId, view: "all" }),
    fetchGoodsSettings({ shopId: shop.id, actorUserId: ctx.userId }),
  ]);
  const vertical: GoodsVertical = settingsRes.ok ? settingsRes.data.vertical : "general";
  // Только то, что на витрине: сайт принимает в заказ лишь активные объявления.
  const items = itemsRes.ok ? itemsRes.data.items.filter(it => it.visibility === "visible") : [];
  const byId = new Map(items.map(it => [it.listingId, it]));
  const picked: Picked[] = parseItemsParam(pick(sp.i)).filter(p => byId.has(p.listingId));
  const step = pick(sp.step) === "1" && picked.length > 0 ? 1 : 0;
  const q = pick(sp.q).trim();
  const err = pick(sp.err);
  const sum = picked.reduce((s, p) => s + p.qty * (byId.get(p.listingId)?.price ?? 0), 0);

  // Набранное едет по всем переходам: смена количества не должна стирать
  // имя и телефон, пришедшие из карточки клиента или из отказа.
  const echo: Record<string, string> = {};
  for (const k of ECHO_FIELDS) if (pick(sp[k])) echo[k] = pick(sp[k]);
  const href = (over: { step?: number; i?: Picked[]; q?: string }) => {
    const usp = new URLSearchParams();
    const s = over.step ?? step;
    if (s) usp.set("step", String(s));
    const list = serializeItemsParam(over.i ?? picked);
    if (list) usp.set("i", list);
    const qq = over.q ?? q;
    if (qq) usp.set("q", qq);
    for (const [k, v] of Object.entries(echo)) usp.set(k, v);
    const str = usp.toString();
    return str ? `/zakazy/novyi?${str}` : "/zakazy/novyi";
  };
  const flowers = vertical === "flowers";
  const electronics = vertical === "electronics";
  const method = echo.method || (electronics ? "pickup" : "courier");
  const payment = echo.payment || "on_receipt";
  const reserveDays = Number(echo.reserveDays) || 2;

  const dots = (
    <span className="sheet-dots" aria-hidden="true">
      {STEPS.map((s, i) => <i key={s.title} className={`${i <= step ? "on" : ""}${i === step ? " at" : ""}`} />)}
    </span>
  );

  if (items.length === 0) {
    return (
      <>
        <ScreenHead title="Новый заказ" sub={HEAD_SUB} back="/zakazy" />
        <div className="page page-narrow stack">
          <div className="head"><div><div className="head-t">Новый заказ</div><div className="head-s">{HEAD_SUB}</div></div></div>
          {!itemsRes.ok ? <Flash err={itemsRes.error} title="Товары не загрузились" /> : (
            <div className="card card-accent">
              <div className="note-t">На витрине нет товаров</div>
              <div className="note-s">Заказ собирается из объявлений магазина: позиций «свободной строкой» сайт не принимает. Заведите товары в кабинете на сайте — и они появятся здесь.</div>
              <a className="aui-btn aui-btn--outline aui-btn--sm" href={shopStorefrontUrl(shop.id)}>Добавить товар на сайте</a>
            </div>
          )}
        </div>
      </>
    );
  }

  const shown = q ? items.filter(it => matchItem(it, q)) : items;
  const qtyOf = (id: number) => picked.find(p => p.listingId === id)?.qty ?? 0;

  return (
    <>
      <ScreenHead title="Новый заказ" sub={STEPS[step].sub} back={step === 0 ? "/zakazy" : href({ step: 0 })} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Новый заказ</div>
            <div className="head-s">{HEAD_SUB}</div>
          </div>
        </div>

        <Flash err={err} />

        <div className="sect">{STEPS[step].title}{dots}</div>

        {step === 0 ? (
          <>
            <form className="search" method="get" action="/zakazy/novyi">
              <Icon name="search" size={18} />
              <input name="q" defaultValue={q} placeholder="Название товара" aria-label="Поиск товара" />
              {picked.length > 0 && <input type="hidden" name="i" value={serializeItemsParam(picked)} />}
              {Object.entries(echo).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            </form>

            <div className="card card-flat">
              {shown.length === 0 ? (
                <div className="dash-none card-pad">Ничего не нашли — попробуйте короче.</div>
              ) : shown.map(it => {
                const n = qtyOf(it.listingId);
                const max = maxQty(it);
                return (
                  <div key={it.listingId} className="oi">
                    <Thumb src={it.img} alt={it.title} size={48} />
                    <div className="row-main">
                      <div className="oi-t">{it.title}</div>
                      <div className="oi-s">{formatRub(it.price)} · <Pill spec={stockPill(it)} /></div>
                    </div>
                    <div className="qty" aria-label={`Количество: ${it.title}`}>
                      <Link href={href({ i: withQty(picked, it.listingId, -1) })} aria-label="Меньше" aria-disabled={n === 0 ? "true" : undefined}>−</Link>
                      <span className="num">{n}</span>
                      <Link href={href({ i: withQty(picked, it.listingId, 1, max) })} aria-label="Больше" aria-disabled={n >= max ? "true" : undefined}>+</Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky-actions">
              <div className="qty-sum">{count(picked.length, "позиция", "позиции", "позиций")} · {rub(sum)}</div>
              {picked.length > 0
                ? <Link className="aui-btn aui-btn--primary aui-btn--lg" href={href({ step: 1 })}>Дальше</Link>
                : <span className="aui-btn aui-btn--primary aui-btn--lg" aria-disabled="true" style={{ opacity: .5 }}>Дальше</span>}
            </div>
          </>
        ) : (
          <>
            <div className="card card-flat">
              {picked.map(p => {
                const it = byId.get(p.listingId)!;
                return (
                  <div key={p.listingId} className="oi">
                    <Thumb src={it.img} alt={it.title} size={40} />
                    <div className="row-main">
                      <div className="oi-t">{it.title}</div>
                      <div className="oi-s">{p.qty} × {formatRub(it.price)}</div>
                    </div>
                    <div className="oi-tail price">{rub(p.qty * (it.price ?? 0))}</div>
                  </div>
                );
              })}
              <Link className="row-more" href={href({ step: 0 })}>Изменить состав<Icon name="chevron" size={14} /></Link>
            </div>

            <form id={FORM} action={createOrderAction} className="card stack">
              <input type="hidden" name="items" value={serializeItemsParam(picked)} />

              <div className="lbl">Клиент</div>
              <div className="fld-row">
                <label className="fld"><span>Имя</span><input name="name" defaultValue={echo.name ?? ""} maxLength={60} required placeholder="Мадина" /></label>
                <label className="fld"><span>Телефон</span><input name="phone" type="tel" inputMode="tel" defaultValue={echo.phone ?? ""} required placeholder="+7 940 …" /></label>
              </div>

              <div className="lbl">Получение</div>
              <div className="seg">
                <label><input type="radio" name="method" value="courier" defaultChecked={method === "courier"} />Доставка</label>
                <label><input type="radio" name="method" value="pickup" defaultChecked={method === "pickup"} />Самовывоз</label>
              </div>
              <label className="fld"><span>Адрес доставки</span><input name="address" defaultValue={echo.address ?? ""} maxLength={200} placeholder="ул. Лакоба 24, кв. 7" /></label>
              <div className="fld-row">
                <label className="fld"><span>Дата доставки</span><input name="deliveryDate" type="date" defaultValue={echo.deliveryDate ?? ""} /></label>
                <label className="fld"><span>Доставка, ₽</span><input name="deliveryPrice" inputMode="numeric" defaultValue={echo.deliveryPrice ?? "0"} /></label>
              </div>
              <div className="fld-row">
                <label className="fld"><span>Окно с</span><input name="windowFrom" type="time" defaultValue={echo.windowFrom ?? ""} /></label>
                <label className="fld"><span>Окно до</span><input name="windowTo" type="time" defaultValue={echo.windowTo ?? ""} /></label>
              </div>
              <label className="fld"><span>Самовывоз ко времени</span><input name="pickupAt" type="datetime-local" defaultValue={echo.pickupAt ?? ""} /></label>
              <p className="hint">Для доставки — адрес, дата и окно; для самовывоза — время, если договорились. Незаполненное сайт пропустит.</p>

              {flowers && (
                <>
                  <div className="lbl">Цветы</div>
                  <div className="fld-row">
                    <label className="fld"><span>Получатель, если не клиент</span><input name="recipientName" defaultValue={echo.recipientName ?? ""} maxLength={60} placeholder="Мама" /></label>
                    <label className="fld"><span>Телефон получателя</span><input name="recipientPhone" type="tel" inputMode="tel" defaultValue={echo.recipientPhone ?? ""} /></label>
                  </div>
                  <label className="fld"><span>Открытка</span><textarea name="card" defaultValue={echo.card ?? ""} maxLength={300} placeholder="С днём рождения, мама" /></label>
                  <label className="fld"><span>Состав</span><textarea name="composition" defaultValue={echo.composition ?? ""} maxLength={500} placeholder="15 пионов, эвкалипт" /></label>
                </>
              )}

              {electronics && (
                <div className="fld">
                  <span>Резерв</span>
                  <div className="chips chips-wrap">
                    {RESERVE_DAYS.map(d => (
                      <label key={d} className="chip chip-radio">
                        <input type="radio" name="reserveDays" value={d} defaultChecked={d === reserveDays} />
                        {count(d, "день", "дня", "дней")}
                      </label>
                    ))}
                  </div>
                  <p className="hint">Держим товар под клиента; истёкший резерв заказ не отменяет.</p>
                </div>
              )}

              <div className="fld">
                <span>Оплата</span>
                <div className="chips chips-wrap">
                  {GOODS_PAYMENTS.map(p => (
                    <label key={p} className="chip chip-radio">
                      <input type="radio" name="payment" value={p} defaultChecked={p === payment} />
                      {PAYMENT_LABEL[p]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="fld"><span>Заметка к заказу</span><textarea name="note" defaultValue={echo.note ?? ""} maxLength={500} placeholder="Позвонить за полчаса" /></label>

              <label className="chk">
                <input type="checkbox" name="accept" value="1" defaultChecked />
                <span>Сразу принять в работу<br /><span className="chk-s">иначе заказ ляжет в «Новые» и будет ждать «Принять»</span></span>
              </label>
            </form>

            <div className="sticky-actions">
              <Link className="aui-btn aui-btn--secondary aui-btn--lg" href={href({ step: 0 })}>Назад</Link>
              <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Завести заказ · {rub(sum)}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
