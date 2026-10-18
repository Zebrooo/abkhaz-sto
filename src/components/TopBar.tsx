import Link from "next/link";
import { can, type ShopKind, type StoRole } from "@/lib/access";
import { Icon } from "@/components/Icon";
import { initials } from "@/lib/format";
import { switchShopAction } from "@/app/(app)/shop-actions";

/** Витрина в переключателе шапки: номер, имя и что это — сервис или магазин. */
export type ShopChoice = { id: number; name: string; kind: ShopKind };

/**
 * Верхняя панель рабочего места (от 881px): логотип площадки, чья это
 * витрина, поиск по клиентам и главная кнопка. На телефоне её нет.
 * Мастеру не показываем ни поиск, ни «Записать клиента»: клиенты и ручная
 * запись — не его работа (макет веба, canBook). У магазина товаров поиск
 * ведёт в его клиентов, главная кнопка — новый заказ по звонку, а колокола
 * нет: лента уведомлений — про записи сервиса.
 *
 * Несколько витрин у одного человека (сервис и магазин) — имя становится
 * раскрывающимся списком: обычный <details>, без клиентского кода, выбор —
 * серверное действие с кукой (shop-actions.ts).
 */
export function TopBar({ shop, kind, role, newHref, unread, shops }: {
  shop: ShopChoice; kind: ShopKind; role: StoRole; newHref: string; unread: number; shops: readonly ShopChoice[];
}) {
  const goods = kind === "goods";
  const canBook = goods || role !== "master";
  return (
    <header className="topbar">
      <Link className="logo-wrap" href="/" aria-label={goods ? "Абхаз Авто · Магазин" : "Абхаз Авто · Сервис"}>
        <span className="logo">
          <span className="logo-a">А</span>бхаз<span className="logo-gap"> </span><span className="logo-a">А</span>вто
        </span>
        <span className="logo-sub">{goods ? "Магазин" : "Сервис"}</span>
      </Link>
      <ShopSwitch shop={shop} shops={shops} />
      {canBook && (
        <form className="search" action={goods ? "/pokupateli" : "/klienty"} role="search">
          <Icon name="search" size={17} />
          <input name="q" placeholder={goods ? "Клиент, телефон или № заказа" : "Клиент, номер машины или № записи"} aria-label="Поиск" />
        </form>
      )}
      <div className="topbar-right">
        {!goods && can(role, "shift") && (
          <Link className="bell" href="/uvedomleniya" aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="dot" />}
          </Link>
        )}
        {canBook && (
          <Link className="aui-btn aui-btn--primary aui-btn--md" href={newHref}>
            <Icon name="plus" size={17} />{goods ? "Новый заказ" : "Записать клиента"}
          </Link>
        )}
        <span className="me" aria-hidden="true">{initials(shop.name.replace(/[«»"]/g, ""))}</span>
      </div>
    </header>
  );
}

const KIND_LABEL: Record<ShopKind, string> = { service: "автосервис", goods: "магазин" };

export function ShopSwitch({ shop, shops }: { shop: ShopChoice; shops: readonly ShopChoice[] }) {
  if (shops.length < 2) return <div className="shop-switch">{shop.name}</div>;
  return (
    <details className="shop-switch shop-menu">
      <summary>{shop.name}<Icon name="chevDown" size={14} /></summary>
      <div className="shop-menu-list">
        {shops.map(s => (
          <form key={s.id} action={switchShopAction}>
            <input type="hidden" name="shopId" value={s.id} />
            <button type="submit" aria-current={s.id === shop.id ? "true" : undefined}>
              {s.name}<small>{KIND_LABEL[s.kind]}</small>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
