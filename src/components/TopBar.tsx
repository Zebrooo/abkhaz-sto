import Link from "next/link";
import { Icon } from "@/components/Icon";
import { initials } from "@/lib/format";

/**
 * Верхняя панель рабочего места (от 881px): логотип площадки, чей это
 * сервис, поиск по клиентам и главная кнопка. На телефоне её нет.
 */
export function TopBar({ shopName, newHref, unread }: { shopName: string; newHref: string; unread: number }) {
  return (
    <header className="topbar">
      <Link className="logo-wrap" href="/" aria-label="Абхаз Авто · Сервис">
        <span className="logo">
          <span className="logo-a">А</span>бхаз<span className="logo-gap"> </span><span className="logo-a">А</span>вто
        </span>
        <span className="logo-sub">Сервис</span>
      </Link>
      <div className="shop-switch">{shopName}</div>
      <form className="search" action="/klienty" role="search">
        <Icon name="search" size={17} />
        <input name="q" placeholder="Клиент, номер машины или № записи" aria-label="Поиск" />
      </form>
      <div className="topbar-right">
        <Link className="bell" href="/uvedomleniya" aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}>
          <Icon name="bell" size={19} />
          {unread > 0 && <span className="dot" />}
        </Link>
        <Link className="aui-btn aui-btn--primary aui-btn--md" href={newHref}>
          <Icon name="plus" size={17} />Записать клиента
        </Link>
        <span className="me" aria-hidden="true">{initials(shopName.replace(/[«»"]/g, ""))}</span>
      </div>
    </header>
  );
}
