import Link from "next/link";
import { can, type StoRole } from "@/lib/access";
import { Icon } from "@/components/Icon";
import { initials } from "@/lib/format";

/**
 * Верхняя панель рабочего места (от 881px): логотип площадки, чей это
 * сервис, поиск по клиентам и главная кнопка. На телефоне её нет.
 * Мастеру не показываем ни поиск, ни «Записать клиента»: клиенты и ручная
 * запись — не его работа (макет веба, canBook).
 */
export function TopBar({ shopName, role, newHref, unread }: { shopName: string; role: StoRole; newHref: string; unread: number }) {
  const canBook = role !== "master";
  return (
    <header className="topbar">
      <Link className="logo-wrap" href="/" aria-label="Абхаз Авто · Сервис">
        <span className="logo">
          <span className="logo-a">А</span>бхаз<span className="logo-gap"> </span><span className="logo-a">А</span>вто
        </span>
        <span className="logo-sub">Сервис</span>
      </Link>
      <div className="shop-switch">{shopName}</div>
      {canBook && (
        <form className="search" action="/klienty" role="search">
          <Icon name="search" size={17} />
          <input name="q" placeholder="Клиент, номер машины или № записи" aria-label="Поиск" />
        </form>
      )}
      <div className="topbar-right">
        {can(role, "shift") && (
          <Link className="bell" href="/uvedomleniya" aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="dot" />}
          </Link>
        )}
        {canBook && (
          <Link className="aui-btn aui-btn--primary aui-btn--md" href={newHref}>
            <Icon name="plus" size={17} />Записать клиента
          </Link>
        )}
        <span className="me" aria-hidden="true">{initials(shopName.replace(/[«»"]/g, ""))}</span>
      </div>
    </header>
  );
}
