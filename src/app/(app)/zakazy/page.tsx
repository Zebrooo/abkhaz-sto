import Link from "next/link";
import { transitionOrderAction } from "@/app/(app)/goods-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pills } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { Thumb } from "@/components/Thumb";
import { fetchGoodsOrders, isOrderView, ORDER_VIEWS, type GoodsOrderOut, type GoodsOrderView } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { formatPhone } from "@/lib/format";
import {
  ACTION_SHEET, actionsFor, itemsLine, matchOrder, ORDER_VIEW_LABEL, orderPills, orderTitle, phoneDigits, statusPill, whatsappUrl,
} from "@/lib/goods/orders";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function href(v: GoodsOrderView, q: string): string {
  const sp = new URLSearchParams();
  if (v !== "new") sp.set("v", v);
  if (q) sp.set("q", q);
  const s = sp.toString();
  return s ? `/zakazy?${s}` : "/zakazy";
}

/** Пустое состояние — по виду: «нет новых» и «нет закрытых» значат разное. */
const EMPTY: Record<GoodsOrderView, [string, string]> = {
  new: ["Новых заказов нет", "Заказы с витрины появятся здесь сами, а заказ по звонку заводится кнопкой «Новый заказ»."],
  work: ["В работе ничего нет", "Принятые заказы ждут сборки здесь — примите новый, и он появится."],
  ready: ["Готовых заказов нет", "Собранные заказы ждут выдачи или курьера здесь."],
  delivery: ["У курьера ничего нет", "Заказы, переданные курьеру, лежат здесь до «Доставлен»."],
  closed: ["Закрытых заказов за 60 дней нет", "Выданные и отменённые заказы остаются здесь два месяца."],
};

/**
 * «Заказы» — виды чипами (новые · в работе · готовы · доставка · закрыты),
 * поиск и карточки с одним главным действием по статусу (артборд). Список
 * отдаёт сайт по виду, поиск — по загруженному: больше 200 заказов в одном
 * виде не бывает, а гонять сайт за каждой буквой незачем. Действия, которым
 * нужна шторка (время сборки, курьер, серийники), ведут в карточку заказа.
 */
export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const view: GoodsOrderView = isOrderView(pick(sp.v)) ? pick(sp.v) as GoodsOrderView : "new";
  const q = pick(sp.q).trim();
  const res = await fetchGoodsOrders({ shopId: shop.id, actorUserId: ctx.userId, view });
  const now = new Date();
  const orders = res.ok ? res.data.orders : [];
  const counts = res.ok ? res.data.counts : null;
  const shown = q ? orders.filter(o => matchOrder(o, q)) : orders;
  const self = href(view, q);

  return (
    <>
      <ScreenHead title="Заказы" sub={counts ? `сегодня ${counts.today}` : undefined} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Заказы</div>
            <div className="head-s">Новый → принят/собрать → готов → у курьера → закрыт; отказ — с любой стадии. Одно главное действие на карточке.</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--primary aui-btn--md" href="/zakazy/novyi">Новый заказ</Link>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <div className="chips">
          {ORDER_VIEWS.map(v => (
            <Link key={v} className="chip" href={href(v, q)} aria-current={v === view ? "page" : undefined}>
              {ORDER_VIEW_LABEL[v]}{counts ? ` ${counts[v]}` : ""}
            </Link>
          ))}
        </div>

        <form className="search" method="get" action="/zakazy">
          <Icon name="search" size={18} />
          <input name="q" defaultValue={q} placeholder="Номер заказа, имя, телефон или товар" aria-label="Поиск заказа" />
          {view !== "new" && <input type="hidden" name="v" value={view} />}
        </form>

        {!res.ok ? (
          <Flash err={res.code === "not_found" ? "Раздел магазина на сайте выключен — включает поддержка площадки." : res.error} title="Заказы не загрузились" />
        ) : shown.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="list" size={26} /></span>
            <div className="empty-t">{q ? "Ничего не нашли" : EMPTY[view][0]}</div>
            <div className="empty-s">{q ? "Поиск идёт по номеру, имени, телефону, адресу и названию товара в этом виде." : EMPTY[view][1]}</div>
            {q && <Link className="aui-btn aui-btn--outline aui-btn--md" href={href(view, "")}>Показать все</Link>}
          </div>
        ) : (
          <div className="ggrid">
            {shown.map(o => <OrderCard key={o.id} o={o} now={now} self={self} />)}
          </div>
        )}
      </div>
    </>
  );
}

function OrderCard({ o, now, self }: { o: GoodsOrderOut; now: Date; self: string }) {
  const digits = phoneDigits(o.buyer.phone);
  const wa = whatsappUrl(o.buyer.phone);
  const actions = actionsFor(o);
  return (
    <div className="card card-sm gcard">
      <div className="gcard-top">
        <Thumb src={o.items[0]?.img ?? null} alt={orderTitle(o)} />
        <div className="row-main">
          <Link className="gcard-t" href={`/zakazy/${o.id}`}>{orderTitle(o)}</Link>
          <div className="gcard-s">{itemsLine(o)} · № {o.number}</div>
          <div className="gcard-who">{o.buyer.name}{o.buyer.phone ? ` · ${formatPhone(o.buyer.phone)}` : ""}</div>
        </div>
        <Link className="icon-btn" href={`/zakazy/${o.id}`} aria-label={`Открыть заказ № ${o.number}`}>
          <Icon name="chevron" size={18} />
        </Link>
      </div>
      <Pills specs={[statusPill(o, now), ...orderPills(o, now)]} />
      <div className="gcard-actions">
        {digits && <a className="aui-btn aui-btn--secondary aui-btn--sm" href={`tel:+${digits}`}>Позвонить</a>}
        {wa && <a className="aui-btn aui-btn--secondary aui-btn--sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {actions.map((a, i) => {
          const cls = `aui-btn ${i === 0 ? "aui-btn--primary" : "aui-btn--outline"} aui-btn--sm`;
          if (a.needs !== "none") {
            return <Link key={a.status} className={cls} href={`/zakazy/${o.id}?do=${ACTION_SHEET[a.needs]}`}>{a.label}</Link>;
          }
          return (
            <form key={a.status} action={transitionOrderAction}>
              <input type="hidden" name="orderId" value={o.id} />
              <input type="hidden" name="status" value={a.status} />
              {a.paid && <input type="hidden" name="paid" value="1" />}
              <input type="hidden" name="return" value={self} />
              <button className={cls} type="submit">{a.label}</button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
