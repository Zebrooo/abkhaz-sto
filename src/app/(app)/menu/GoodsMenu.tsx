import Link from "next/link";
import { saveVerticalAction } from "@/app/(app)/goods-actions";
import { EXIT, ExitCard, ExitSheet } from "@/app/(app)/menu/Exit";
import { ShopSwitchCard } from "@/app/(app)/menu/ShopSwitchCard";
import { Flash } from "@/components/Flash";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { fetchGoodsSettings, fetchGoodsToday, GOODS_VERTICALS, type GoodsVertical } from "@/lib/api/goods";
import type { ServiceContext } from "@/lib/context";
import { formatPhone } from "@/lib/format";
import { storefrontLine, subscriptionLine } from "@/lib/goods/today";
import { goodsMenu, type GoodsMenuKey } from "@/lib/nav";
import { myServiceShops } from "@/lib/shop";
import { shopCabinetUrl, shopStorefrontUrl } from "@/lib/site";
import { getServerUser } from "@/lib/supabase/server";

type Query = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const VERTICAL_FORM = "vertical";

export const VERTICAL_LABEL: Record<GoodsVertical, string> = { flowers: "Цветы", electronics: "Электроника", general: "Другие товары" };
const VERTICAL_SUB: Record<GoodsVertical, string> = {
  flowers: "получатель, окно доставки, открытка и состав букета",
  electronics: "резерв, гарантия и серийный номер при выдаче",
  general: "общие поля заказа — без открытки и без гарантии",
};

type Item = { key: GoodsMenuKey; href: string; icon: IconName; title: string; sub: string; external?: boolean };

function Row({ href, icon, title, sub, external }: Omit<Item, "key">) {
  const body = (
    <>
      <span className="sq"><Icon name={icon} size={18} /></span>
      <div className="row-main">
        <div className="row-t">{title}</div>
        <div className="row-s">{sub}</div>
      </div>
      <span className="chev"><Icon name="chevron" size={16} /></span>
    </>
  );
  return external
    ? <a className="row mrow" href={href} target="_blank" rel="noreferrer">{body}</a>
    : <Link className="row mrow" href={href}>{body}</Link>;
}

/**
 * «Ещё» магазина товаров: витрина на сайте, подписка, вертикаль (хозяину),
 * переключение витрин и выход. Цифры — с сайта (/goods/today), и если он
 * молчит, строки остаются без них: экран нужен ради ссылок и выхода.
 */
export async function GoodsMenu({ ctx, sp }: { ctx: ServiceContext; sp: Query }) {
  const { shop, role } = ctx;
  const who = { shopId: shop.id, actorUserId: ctx.userId };
  const [todayRes, settingsRes, user, shops] = await Promise.all([
    fetchGoodsToday(who), fetchGoodsSettings(who), getServerUser(), myServiceShops(),
  ]);
  const me = formatPhone(user?.phone) || user?.email || "";
  const today = todayRes.ok ? todayRes.data : null;
  const vertical: GoodsVertical | null = settingsRes.ok ? settingsRes.data.vertical : today?.shop.vertical ?? null;
  const act = pick(sp.do);

  const ITEMS: Record<GoodsMenuKey, Item> = {
    shop: {
      key: "shop", href: today?.shop.storefrontUrl ?? shopStorefrontUrl(shop.id), icon: "shop", title: "Витрина на сайте",
      sub: today ? `abkhaz-auto.ru · ${storefrontLine(today.shop)}` : "abkhaz-auto.ru · рубрика «Товары»", external: true,
    },
    subscription: {
      key: "subscription", href: shopCabinetUrl(), icon: "clock", title: "Подписка",
      sub: today ? subscriptionLine(today.subscription) : "срок и счета — в кабинете на сайте", external: true,
    },
    vertical: {
      key: "vertical", href: "/menu?do=vertical", icon: "cog", title: "Чем торгует магазин",
      sub: vertical ? `${VERTICAL_LABEL[vertical].toLowerCase()} · ${VERTICAL_SUB[vertical]}` : "цветы, электроника или другие товары — набор полей заказа",
    },
  };

  return (
    <>
      <ScreenHead title="Ещё" sub="настройки магазина" />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Ещё</div>
            <div className="head-s">Витрина на сайте, подписка и вертикаль магазина — то, что не поместилось во вкладки.</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={act ? "" : pick(sp.err)} />

        <div className="card card-flat">
          {goodsMenu(role).map(k => {
            const it = ITEMS[k];
            return <Row key={k} href={it.href} icon={it.icon} title={it.title} sub={it.sub} external={it.external} />;
          })}
        </div>

        <ShopSwitchCard shops={shops} currentId={shop.id} />

        <ExitCard me={me} />
        <div className="foot-note">АбхазАвто Бизнес · 1.0 · business.abkhaz-auto.ru</div>
      </div>

      {act === EXIT && <ExitSheet me={me} />}

      {act === "vertical" && role === "owner" && (
        <Sheet closeHref="/menu" title="Чем торгует магазин" sub="набор полей заказа"
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href="/menu">Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={VERTICAL_FORM}>Сохранить</button></>}>
          <form id={VERTICAL_FORM} action={saveVerticalAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <div className="fld">
              <span>Вертикаль</span>
              <div className="chips chips-wrap">
                {GOODS_VERTICALS.map(v => (
                  <label key={v} className="chip chip-radio">
                    <input type="radio" name="vertical" value={v} defaultChecked={v === (vertical ?? "general")} />
                    {VERTICAL_LABEL[v]}
                  </label>
                ))}
              </div>
            </div>
            {GOODS_VERTICALS.map(v => <p key={v} className="sheet-note"><b>{VERTICAL_LABEL[v]}</b> — {VERTICAL_SUB[v]}.</p>)}
            <p className="sheet-note">Сайт поля по вертикали не отсекает — только проверяет их форму: цветочный магазин, записавший серийный номер, ничего не ломает.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
