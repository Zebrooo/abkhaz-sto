import Link from "next/link";
import { saveGoodsClientNoteAction } from "@/app/(app)/goods-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Pills } from "@/components/Pill";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { fetchGoodsClients, fetchGoodsSettings, isClientView, type GoodsClientView, type GoodsVertical } from "@/lib/api/goods";
import { requireGoods } from "@/lib/context";
import { count, formatPhone, initials } from "@/lib/format";
import { CLIENT_VIEW_LABEL, clientLine, clientPills, clientViews, formatClientDates, matchGoodsClient } from "@/lib/goods/clients";
import { phoneDigits, whatsappUrl } from "@/lib/goods/orders";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const FORM = "client-note";

function href(v: GoodsClientView, q: string, note = ""): string {
  const sp = new URLSearchParams();
  if (v !== "all") sp.set("v", v);
  if (q) sp.set("q", q);
  if (note) sp.set("note", note);
  const s = sp.toString();
  return s ? `/pokupateli?${s}` : "/pokupateli";
}

const EMPTY: Record<GoodsClientView, string> = {
  all: "Клиент заводится сам из первого заказа по номеру телефона — с витрины или по звонку.",
  regular: "Постоянные — три и больше закрытых заказа. Пока таких нет.",
  holidays: "Праздники в ближайшие две недели — по датам, которые вы записали в заметку клиента.",
  dormant: "Давно не брали — последний заказ больше трёх месяцев назад.",
  warranty: "Гарантия по выданным заказам кончается в ближайший месяц — таких нет.",
};

/**
 * «Клиенты» магазина — база собирается сама из заказов по телефону на сайте
 * (контракт goods §5); сегменты чипами вместо воронок: постоянные,
 * праздники скоро, давно не брали, у электроники — гарантия. Рассылок нет —
 * «Написать» открывает WhatsApp, «Новый заказ» ведёт в форму заказа по
 * звонку с именем и номером. Заметка и даты — шторкой по адресу (?note=).
 */
export default async function GoodsClientsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireGoods())!;
  const { shop } = ctx;
  const [res, settingsRes] = await Promise.all([
    fetchGoodsClients({ shopId: shop.id, actorUserId: ctx.userId, view: isClientView(pick(sp.v)) ? pick(sp.v) as GoodsClientView : "all" }),
    fetchGoodsSettings({ shopId: shop.id, actorUserId: ctx.userId }),
  ]);
  const vertical: GoodsVertical = settingsRes.ok ? settingsRes.data.vertical : "general";
  const views = clientViews(vertical);
  const view: GoodsClientView = isClientView(pick(sp.v)) && views.includes(pick(sp.v) as GoodsClientView) ? pick(sp.v) as GoodsClientView : "all";
  const q = pick(sp.q).trim();
  const now = new Date();
  const clients = res.ok ? res.data.clients : [];
  const counts = res.ok ? res.data.counts : null;
  const shown = q ? clients.filter(c => matchGoodsClient(c, q)) : clients;
  const editing = clients.find(c => c.phone === pick(sp.note)) ?? null;
  const listHref = href(view, q);
  const total = counts ? count(counts.all, "клиент", "клиента", "клиентов") : "магазин";

  return (
    <>
      <ScreenHead title="Клиенты" sub={total} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Клиенты</div>
            <div className="head-s">{total} · база собирается сама из заказов по телефону. Рассылок нет — только список «кому написать» и WhatsApp.</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={editing ? "" : pick(sp.err)} />

        {counts && (
          <div className="chips">
            {views.map(v => (
              <Link key={v} className="chip" href={href(v, q)} aria-current={v === view ? "page" : undefined}>
                {CLIENT_VIEW_LABEL[v]} {counts[v]}
              </Link>
            ))}
          </div>
        )}

        <form className="search" method="get" action="/pokupateli">
          <Icon name="search" size={18} />
          <input name="q" defaultValue={q} placeholder="Имя, телефон или заметка" aria-label="Поиск клиента" />
          {view !== "all" && <input type="hidden" name="v" value={view} />}
        </form>

        {!res.ok ? (
          <Flash err={res.code === "not_found" ? "Раздел магазина на сайте выключен — включает поддержка площадки." : res.error} title="Клиенты не загрузились" />
        ) : shown.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="users" size={26} /></span>
            <div className="empty-t">{q ? "Никого не нашли" : clients.length === 0 && view === "all" ? "Клиентов пока нет" : "В этом виде пусто"}</div>
            <div className="empty-s">{q ? "Поиск идёт по имени, телефону и заметке." : EMPTY[view]}</div>
            {q && <Link className="aui-btn aui-btn--outline aui-btn--md" href={href(view, "")}>Показать всех</Link>}
          </div>
        ) : (
          <div className="ggrid">
            {shown.map(c => {
              const digits = phoneDigits(c.phone);
              const wa = whatsappUrl(c.phone);
              const newOrder = `/zakazy/novyi?name=${encodeURIComponent(c.name)}&phone=${encodeURIComponent(c.phone)}`;
              return (
                <div key={c.phone} className="card card-sm gcard">
                  <div className="gcard-top">
                    <span className="ava ava-accent" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(c.name)}</span>
                    <div className="row-main">
                      <div className="gcard-t">{c.name}</div>
                      <div className="gcard-s">{clientLine(c, now)}</div>
                      <div className="gcard-who">{formatPhone(c.phone)}{c.hasAccount ? " · с сайта" : ""}</div>
                    </div>
                    <Link className="icon-btn" href={href(view, q, c.phone)} aria-label={`Заметка: ${c.name}`}>
                      <Icon name="edit" size={18} />
                    </Link>
                  </div>
                  <Pills specs={clientPills(c)} />
                  {c.note && <div className="gcard-s">{c.note}</div>}
                  <div className="gcard-actions">
                    {wa && <a className="aui-btn aui-btn--secondary aui-btn--sm" href={wa} target="_blank" rel="noreferrer">Написать</a>}
                    {digits && <a className="aui-btn aui-btn--secondary aui-btn--sm" href={`tel:+${digits}`}>Позвонить</a>}
                    <Link className="aui-btn aui-btn--primary aui-btn--sm" href={newOrder}>Новый заказ</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <Sheet closeHref={listHref} title={editing.name} sub={formatPhone(editing.phone)}
          footer={<><Link className="aui-btn aui-btn--secondary aui-btn--lg" href={listHref}>Отмена</Link><button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={FORM}>Сохранить</button></>}>
          <form id={FORM} action={saveGoodsClientNoteAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <input type="hidden" name="phone" value={editing.phone} />
            <input type="hidden" name="return" value={href(view, q, editing.phone)} />
            <label className="fld">
              <span>Как записать</span>
              <input name="name" defaultValue={editing.name} maxLength={80} />
            </label>
            <label className="fld">
              <span>Заметка — видит только магазин</span>
              <textarea name="note" defaultValue={editing.note} maxLength={1000} placeholder="Любит пионы. Открытка от руки." />
            </label>
            <label className="fld">
              <span>Даты — по одной в строке: ДД.ММ подпись</span>
              <textarea name="dates" defaultValue={formatClientDates(editing.dates)} placeholder={vertical === "electronics" ? "02.11 гарантия на ноутбук\n01.12 апгрейд: предложить ноут" : "19.10 день рождения мамы\n08.03 8 марта"} />
            </label>
            <p className="sheet-note">
              Год не хранится — дата повторяется каждый год, и за две недели до неё клиент попадает в «Праздники скоро».
              {vertical === "electronics" ? " «апгрейд:» в начале подписи — пометка «предлагали апгрейд»." : ""}
              {" "}Пустые поля стирают заметку, клиент остаётся: он из заказов.
            </p>
          </form>
        </Sheet>
      )}
    </>
  );
}
