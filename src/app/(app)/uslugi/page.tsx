import Link from "next/link";
import { currentServiceShop } from "@/lib/shop";
import { countPending } from "@/lib/bookings";
import { listServices } from "@/lib/services";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { count, formatRub, minutesLabel } from "@/lib/format";
import { shopStorefrontUrl } from "@/lib/site";
import { MAX_STO_DURATION_MIN, MIN_STO_DURATION_MIN } from "@/lib/sto/types";
import { saveServiceAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Ходовые длительности: от них считается длина окна, минуты набирать незачем. */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
/** Шаг кнопок «−» и «+» у цены: сотня — привычный шаг прайса сервиса. */
const PRICE_STEP = 100;
const SVC_FORM = "svc-edit";
const HEAD_SUB = "Услуги — объявления витрины на сайте. Длительность задаёт длину окна: поменяли 60 на 90 — сетка записи перестроилась.";

/**
 * «Услуги и цены» — прайс витрины сервиса. Заводятся услуги на сайте, здесь
 * правятся цена, длительность и показ: длительность задаёт длину окна, и от
 * неё пересчитывается вся сетка записи. Правка живёт в шторке, открытой
 * адресом (`?edit=101`), поэтому экран остаётся серверным.
 */
export default async function ServicesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const services = await listServices(shop.id);
  const pending = await countPending(shop.id);

  const edited = services.find(s => s.listingId === Number(pick(sp.edit))) ?? null;
  // Значения шторки — из запроса, а чего в нём нет, то из самой услуги:
  // так кнопки шага и чипы работают ссылками, без клиентского состояния.
  const priceRaw = Number(pick(sp.price));
  const price = pick(sp.price) !== "" && Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw)) : (edited?.price ?? 0);
  const durRaw = Number(pick(sp.dur));
  const dur = Number.isInteger(durRaw) && durRaw >= MIN_STO_DURATION_MIN && durRaw <= MAX_STO_DURATION_MIN
    ? durRaw
    : (edited?.durationMin ?? 0);
  const vis = pick(sp.vis);
  const visible = vis === "1" || vis === "0" ? vis === "1" : edited?.status !== "archived";

  const editHref = (listingId: number, over: { price?: number; dur?: number; vis?: boolean } = {}) => {
    const q = new URLSearchParams({
      edit: String(listingId),
      price: String(over.price ?? price),
      dur: String(over.dur ?? dur),
      vis: (over.vis ?? visible) ? "1" : "0",
    });
    return `/uslugi?${q.toString()}`;
  };

  return (
    <>
      <ScreenHead title="Услуги и цены" sub={`${count(services.length, "услуга", "услуги", "услуг")} на витрине`} back="/menu" unread={pending} />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Услуги и цены</div>
            <div className="head-s">{HEAD_SUB}</div>
          </div>
          <div className="head-tail">
            <a className="aui-btn aui-btn--outline aui-btn--md" href={shopStorefrontUrl(shop.id)}>
              Добавить услугу на сайте<Icon name="arrowRight" size={16} />
            </a>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <p className="hint svc-note">Услуги — объявления витрины на сайте. Здесь правятся цена и длительность: от длительности считаются свободные окна.</p>

        {services.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="wrench" size={24} /></span>
            <div className="empty-t">Услуг пока нет</div>
            <div className="empty-s">Услуги заводятся в кабинете витрины на сайте — оттуда они приходят сюда вместе с ценой.</div>
          </div>
        ) : (
          <div className="svc-grid">
            {services.map(s => (
              <div className="card card-sm" key={s.listingId}>
                <div className="svc-head">
                  <div className="row-main">
                    <div className="svc-title">
                      {s.title}
                      {s.status === "pending" && <span className="aui-badge is-tag-urgent">на модерации</span>}
                      {s.status === "archived" && <span className="aui-badge is-tag-neg">скрыта</span>}
                    </div>
                    <div className="svc-meta">
                      <span className="svc-price">{formatRub(s.price)}</span>
                      <span className="rspec"><Icon name="clock" size={13} />{minutesLabel(s.durationMin)}</span>
                      <span className="rspec">окно {s.durationMin} мин</span>
                    </div>
                  </div>
                  <Link className="icon-btn" href={editHref(s.listingId, { price: s.price ?? 0, dur: s.durationMin, vis: s.status !== "archived" })} aria-label={`Изменить: ${s.title}`}>
                    <Icon name="edit" size={18} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <a className="aui-btn aui-btn--outline aui-btn--md svc-open" href={shopStorefrontUrl(shop.id)}>
          Открыть витрину на сайте<Icon name="arrowRight" size={16} />
        </a>
      </div>

      {edited && (
        <Sheet closeHref="/uslugi" title={edited.title} sub="цена и длительность"
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={SVC_FORM}>Сохранить</button>}>
          {/* Форма живёт в теле, а кнопка — в подвале шторки: их связывает form=. */}
          <form id={SVC_FORM} action={saveServiceAction} className="sheet-stack">
            <input type="hidden" name="shopId" value={shop.id} />
            <input type="hidden" name="listingId" value={edited.listingId} />
            <input type="hidden" name="durationMin" value={dur} />
            <input type="hidden" name="visible" value={visible ? "1" : "0"} />

            {/* Не <label>: внутри ссылки шага, а ссылку в подписи поля не прячут. */}
            <div className="fld">
              <span>Цена, {edited.currency === "RUB" ? "₽" : edited.currency}</span>
              <div className="money">
                <Link href={editHref(edited.listingId, { price: Math.max(0, price - PRICE_STEP) })} aria-label="Цена меньше">−</Link>
                <input name="price" inputMode="numeric" maxLength={9} defaultValue={price} placeholder="договорная" aria-label="Цена" />
                <Link href={editHref(edited.listingId, { price: price + PRICE_STEP })} aria-label="Цена больше">+</Link>
              </div>
            </div>

            <div className="fld">
              <span>Длительность — от неё считаются окна</span>
              <div className="chips chips-wrap">
                {DURATIONS.map(m => (
                  <Link key={m} className="chip" href={editHref(edited.listingId, { dur: m })} aria-pressed={m === dur}>{minutesLabel(m)}</Link>
                ))}
              </div>
            </div>

            <div className="split sw-row">
              <div>
                <div className="lbl">Показывать на витрине</div>
                <div className="lbl-s">скрытая услуга доступна только вам</div>
              </div>
              <Link className="sw" href={editHref(edited.listingId, { vis: !visible })} aria-pressed={visible} aria-label="Показывать на витрине"><span /></Link>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}
