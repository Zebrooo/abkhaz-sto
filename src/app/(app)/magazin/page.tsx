import Link from "next/link";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { fetchGoodsToday } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { count, rub } from "@/lib/format";
import { handoverLabel, orderTitle, slaLabel, statusPill, upcomingTime } from "@/lib/goods/orders";
import { adsLine, monthLabel, storefrontLine, subscriptionLine, subscriptionTone, todaySplit } from "@/lib/goods/today";
import { adsCabinetUrl, shopCabinetUrl } from "@/lib/site";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * «Сегодня» — первый экран магазина товаров (артборд «СРМ владельца»):
 * подписка с кнопкой оплаты, четыре числа, ближайшие заказы по времени,
 * реклама. Всё считает сайт (lib/api/goods.ts, /goods/today), экран только
 * подписывает. Сайт молчит — говорим об этом вслух: пустые нули выглядели бы
 * как «заказов нет», а это не так.
 */
export default async function GoodsTodayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const res = await fetchGoodsToday({ shopId: shop.id, actorUserId: ctx.userId });
  const now = new Date();

  if (!res.ok) {
    const off = res.code === "not_found";
    return (
      <>
        <ScreenHead title={shop.name} sub="магазин" />
        <div className="page page-narrow stack">
          <div className="head"><div><div className="head-t">{shop.name}</div><div className="head-s">магазин товаров</div></div></div>
          <Flash ok={pick(sp.ok)} />
          <div className="card empty">
            <span className="sq"><Icon name="shop" size={26} /></span>
            <div className="empty-t">{off ? "Раздел магазина на сайте выключен" : "Сводка не загрузилась"}</div>
            <div className="empty-s">
              {off
                ? "СРМ магазина включает поддержка площадки (рубильник goods_crm). Экраны появятся, как только сайт ответит."
                : `${res.error}. Потяните экран вниз, чтобы спросить сайт ещё раз.`}
            </div>
          </div>
        </div>
      </>
    );
  }

  const t = res.data;
  const sub = subscriptionLine(t.subscription);
  const tone = subscriptionTone(t.subscription);
  const overdue = t.orders.overdueNew > 0;

  return (
    <>
      <ScreenHead title={t.shop.name} sub={storefrontLine(t.shop)} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">{t.shop.name}</div>
            <div className="head-s">{storefrontLine(t.shop)} · подписка {sub}</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--primary aui-btn--md" href="/zakazy/novyi">Новый заказ</Link>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        {/* Подписка — первой строкой, как на артборде: истёкшая закрывает
            витрину, и узнать об этом владелец должен здесь, а не от клиента. */}
        <div className={`card sub-card${tone === "dng" ? " card-danger" : tone === "warn" ? " card-warm" : ""}`}>
          <div className="row-main">
            <div className="sub-t">Подписка {sub}</div>
            <div className="sub-s">Счёт и ссылку на оплату выставляет менеджер площадки — кнопка ведёт в кабинет на сайте.</div>
          </div>
          <a className="aui-btn aui-btn--primary aui-btn--sm" href={shopCabinetUrl()}>Оплатить</a>
        </div>

        <div className="kpis">
          <Link className={`kpi${overdue ? " is-dng" : ""}`} href="/zakazy?v=new">
            <div className="kpi-l">Новых заказов</div>
            <div className="kpi-v">{t.orders.new}</div>
            <div className="kpi-s">{overdue ? `${t.orders.overdueNew} ждут дольше положенного` : slaLabel(t.slaNewHours)}</div>
          </Link>
          <Link className="kpi" href="/zakazy?v=work">
            <div className="kpi-l">На сегодня</div>
            <div className="kpi-v">{t.orders.today}</div>
            <div className="kpi-s">{todaySplit(t.orders)}</div>
          </Link>
          <div className="kpi">
            <div className="kpi-l">Витрина · 7 дн.</div>
            <div className="kpi-v">{t.storefront7d.views}</div>
            <div className="kpi-s">просмотров · {t.storefront7d.phoneReveals} тел.</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Выручка · {monthLabel(t.month.from)}</div>
            <div className="kpi-v">{rub(t.month.revenue)}</div>
            <div className="kpi-s">по закрытым заказам · {count(t.month.closed, "заказ", "заказа", "заказов")}</div>
          </div>
        </div>

        <div className="card card-flat">
          <div className="lbl card-lbl">Ближайшие</div>
          {t.upcoming.length === 0 ? (
            <div className="dash-none card-pad">Активных заказов нет — новые появятся здесь, как только придут с витрины или вы заведёте заказ по звонку.</div>
          ) : t.upcoming.map(o => (
            <Link key={o.id} className="row up-row" href={`/zakazy/${o.id}`}>
              <span className="up-t mono">{upcomingTime(o)}</span>
              <div className="row-main">
                <div className="row-t">{orderTitle(o)} · {rub(o.total)}</div>
                <div className="row-s">{handoverLabel(o, now)} · {o.buyer.name}</div>
              </div>
              <Pill spec={statusPill(o, now)} />
            </Link>
          ))}
        </div>

        {t.ads && (
          <div className="card sub-card">
            <div className="row-main">
              <div className="sub-t">Реклама «{t.ads.title}»</div>
              <div className="sub-s">{adsLine(t.ads)}</div>
            </div>
            <a className="aui-btn aui-btn--outline aui-btn--sm" href={adsCabinetUrl()}>Пополнить</a>
          </div>
        )}

        {t.shop.storefrontUrl && (
          <a className="aui-btn aui-btn--outline aui-btn--md svc-open" href={t.shop.storefrontUrl}>
            Открыть витрину на сайте<Icon name="arrowRight" size={16} />
          </a>
        )}
      </div>
    </>
  );
}
