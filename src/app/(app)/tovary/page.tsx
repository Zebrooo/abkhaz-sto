import Link from "next/link";
import { saveItemAction } from "@/app/(app)/goods-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pills } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { Thumb } from "@/components/Thumb";
import { fetchGoodsItems, GOODS_STOCK_MODES, isItemView, isStockMode, type GoodsItemView, type GoodsStockMode } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { formatRub } from "@/lib/format";
import { ITEM_VIEW_LABEL, matchItem, reservePill, STOCK_MODE_LABEL, stockPill, VISIBILITY_SHORT, visibilityLine } from "@/lib/goods/items";
import { listingUrl, shopStorefrontUrl } from "@/lib/site";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const FORM = "item-edit";

function href(v: GoodsItemView, cat: string, q: string, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  if (v !== "all") sp.set("v", v);
  if (cat) sp.set("cat", cat);
  if (q) sp.set("q", q);
  for (const [k, val] of Object.entries(extra)) if (val) sp.set(k, val);
  const s = sp.toString();
  return s ? `/tovary?${s}` : "/tovary";
}

/**
 * «Товары» — витрина и склад в одном списке (артборд): цена, остаток,
 * резерв, видимость. Товар — объявление Маркета на сайте; здесь правятся
 * цена и остаток шторкой по адресу (?edit=), новый товар заводится в
 * редакторе объявления на сайте. Остаток 0 снимает карточку с витрины сам,
 * появился — возвращает (контракт goods §4).
 */
export default async function ItemsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const view: GoodsItemView = isItemView(pick(sp.v)) ? pick(sp.v) as GoodsItemView : "all";
  const cat = pick(sp.cat).trim();
  const q = pick(sp.q).trim();
  const res = await fetchGoodsItems({ shopId: shop.id, actorUserId: ctx.userId, view, category: cat || undefined });
  const items = res.ok ? res.data.items : [];
  const counts = res.ok ? res.data.counts : null;
  const categories = res.ok ? res.data.categories : [];
  const shown = q ? items.filter(it => matchItem(it, q)) : items;
  const listHref = href(view, cat, q);

  const edited = items.find(it => it.listingId === Number(pick(sp.edit))) ?? null;
  // Режим остатка в шторке — из адреса (чипы — ссылки), иначе из товара;
  // без строки остатка начинаем со счёта штук: это то, что правят чаще.
  const modeRaw = pick(sp.mode);
  const mode: GoodsStockMode = isStockMode(modeRaw) ? modeRaw : (edited?.stock?.mode ?? "count");
  const editHref = (listingId: number, m?: GoodsStockMode) => href(view, cat, q, { edit: String(listingId), mode: m ?? "" });
  const onShelf = counts ? counts.all - counts.hidden : 0;
  const sub = counts ? `${onShelf} на витрине · ${counts.hidden} скрыто` : "магазин";

  return (
    <>
      <ScreenHead title="Товары" sub={sub} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Товары</div>
            <div className="head-s">{sub} · товар — объявление на сайте, а остаток и цена правятся здесь. Остаток 0 скрывает карточку с витрины сам.</div>
          </div>
          <div className="head-tail">
            <a className="aui-btn aui-btn--outline aui-btn--md" href={shopStorefrontUrl(shop.id)}>
              Добавить товар на сайте<Icon name="arrowRight" size={16} />
            </a>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={edited ? "" : pick(sp.err)} />

        {counts && (
          <div className="chips">
            <Link className="chip" href={href("all", "", q)} aria-current={view === "all" && !cat ? "page" : undefined}>Все {counts.all}</Link>
            {categories.map(c => (
              <Link key={c.slug} className="chip" href={href("all", c.slug, q)} aria-current={view === "all" && cat === c.slug ? "page" : undefined}>
                {c.label} {c.count}
              </Link>
            ))}
            <Link className="chip" href={href("low", "", q)} aria-current={view === "low" ? "page" : undefined}>{ITEM_VIEW_LABEL.low} {counts.low}</Link>
            <Link className="chip" href={href("hidden", "", q)} aria-current={view === "hidden" ? "page" : undefined}>{ITEM_VIEW_LABEL.hidden} {counts.hidden}</Link>
          </div>
        )}

        <form className="search" method="get" action="/tovary">
          <Icon name="search" size={18} />
          <input name="q" defaultValue={q} placeholder="Название, описание или раздел" aria-label="Поиск товара" />
          {view !== "all" && <input type="hidden" name="v" value={view} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
        </form>

        {!res.ok ? (
          <Flash err={res.code === "not_found" ? "Раздел магазина на сайте выключен — включает поддержка площадки." : res.error} title="Товары не загрузились" />
        ) : shown.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="box" size={26} /></span>
            <div className="empty-t">{q ? "Ничего не нашли" : view === "low" ? "Ничего не кончается" : view === "hidden" ? "Скрытых товаров нет" : "Товаров пока нет"}</div>
            <div className="empty-s">
              {q ? "Поиск идёт по названию, описанию и разделу." : view === "all" && !cat
                ? "Товары заводятся в редакторе объявления на сайте — оттуда они приходят сюда вместе с ценой и фото."
                : "В этом виде пусто."}
            </div>
            {q ? <Link className="aui-btn aui-btn--outline aui-btn--md" href={href(view, cat, "")}>Показать все</Link>
              : view === "all" && !cat && <a className="aui-btn aui-btn--outline aui-btn--md" href={shopStorefrontUrl(shop.id)}>Добавить товар на сайте</a>}
          </div>
        ) : (
          <div className="ggrid">
            {shown.map(it => {
              const pills = [stockPill(it)];
              const r = reservePill(it);
              if (r) pills.push(r);
              return (
                <div key={it.listingId} className="card card-sm gcard">
                  <div className="gcard-top">
                    <Thumb src={it.img} alt={it.title} />
                    <div className="row-main">
                      <div className="gcard-t">{it.title}</div>
                      <div className="gcard-s">{it.description ?? it.categoryLabel}</div>
                    </div>
                    <Link className="icon-btn" href={editHref(it.listingId)} aria-label={`Изменить: ${it.title}`}>
                      <Icon name="edit" size={18} />
                    </Link>
                  </div>
                  <Pills specs={pills} />
                  <div className="split">
                    <div>
                      <div className="price">{formatRub(it.price)}</div>
                      <div className="price-s">{VISIBILITY_SHORT[it.visibility]}</div>
                    </div>
                    <a className="aui-btn aui-btn--ghost aui-btn--sm" href={listingUrl(it.slug)} target="_blank" rel="noreferrer">На сайте<Icon name="arrowRight" size={14} /></a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <a className="aui-btn aui-btn--outline aui-btn--md svc-open" href={shopStorefrontUrl(shop.id)}>
          Открыть витрину на сайте<Icon name="arrowRight" size={16} />
        </a>
      </div>

      {edited && (
        <Sheet closeHref={listHref} title={edited.title} sub="цена и остаток"
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={listHref}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Сохранить</button></>}>
          <form id={FORM} action={saveItemAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <input type="hidden" name="listingId" value={edited.listingId} />
            <input type="hidden" name="return" value={editHref(edited.listingId, mode)} />
            <input type="hidden" name="price0" value={edited.price ?? ""} />
            <input type="hidden" name="mode0" value={edited.stock?.mode ?? ""} />
            <input type="hidden" name="qty0" value={edited.stock?.qty ?? ""} />
            <input type="hidden" name="low0" value={edited.stock?.lowThreshold ?? ""} />
            <input type="hidden" name="mode" value={mode} />

            <label className="fld">
              <span>Цена, ₽</span>
              <input name="price" inputMode="numeric" maxLength={11} defaultValue={edited.price ?? ""} placeholder="не указана" />
            </label>

            {/* Не <label>: внутри ссылки режима, а ссылку в подписи поля не прячут. */}
            <div className="fld">
              <span>Остаток</span>
              <div className="chips chips-wrap">
                {GOODS_STOCK_MODES.map(m => (
                  <Link key={m} className="chip" href={editHref(edited.listingId, m)} aria-pressed={m === mode}>{STOCK_MODE_LABEL[m]}</Link>
                ))}
              </div>
            </div>

            {mode === "count" ? (
              <div className="fld-row">
                <label className="fld">
                  <span>На складе, шт</span>
                  <input name="qty" inputMode="numeric" maxLength={5} defaultValue={edited.stock?.mode === "count" ? edited.stock.qty : ""} placeholder="0" />
                </label>
                <label className="fld">
                  <span>Порог «кончаются»</span>
                  <input name="low" inputMode="numeric" maxLength={3} defaultValue={edited.stock?.lowThreshold ?? 1} />
                </label>
              </div>
            ) : (
              <p className="sheet-note">{mode === "today" ? "«Есть сегодня» — товар доступен, штуки не считаем: так живут цветы." : "«Под заказ» — виден и доступен, срок обсуждаете с клиентом."}</p>
            )}
            {edited.stock && edited.stock.reserved > 0 && (
              <p className="sheet-note">В активных заказах {edited.stock.reserved} шт — резерв считается по заказам и из остатка не вычитается, пока заказ не выдан.</p>
            )}
            <p className="sheet-note">{visibilityLine(edited)}</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
