"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ShopKind, StoRole } from "@/lib/access";
import { navKeyOf, ROUTE, sideNav } from "@/lib/nav";
import { Icon } from "@/components/Icon";

/**
 * Разделы слева — только на вебе; на телефоне их заменяют вкладки снизу.
 * Пункты — по виду витрины и роли (lib/nav.ts): у хозяина сервиса есть
 * «Деньги» и «Доступы», у мастера — только осмотр и чат, у магазина товаров
 * — Сегодня, Заказы, Товары, Клиенты.
 */
export function SideNav({ kind, role, siteUrl, unread }: { kind: ShopKind; role: StoRole; siteUrl: string; unread: number }) {
  const current = navKeyOf(usePathname() ?? "/");
  return (
    <nav className="side" aria-label="Разделы">
      {sideNav(kind, role).map(it => {
        const on = it.key === current;
        const count = it.key === "notifs" ? unread : 0;
        return (
          <Link key={it.key} href={ROUTE[it.key]} aria-current={on ? "page" : undefined}>
            <Icon name={it.icon} size={18} />
            <span className="n">{it.label}</span>
            {count > 0 && <span className="c">{count}</span>}
          </Link>
        );
      })}
      <div className="side-foot">
        <p>{kind === "goods" ? "Заказы с витрины приходят сюда сразу." : "Записи с сайта приходят сюда сразу."} Вход — общий с abkhaz-auto.ru.</p>
        <a href={siteUrl} target="_blank" rel="noreferrer">Витрина на сайте <Icon name="arrowRight" size={14} /></a>
        {/* Вкладки «Ещё» на вебе нет, и выход за стойкой было негде найти.
            Ведёт на ту же шторку подтверждения, что и на телефоне: путь
            выхода один, а не два. */}
        <Link className="side-exit" href="/menu?do=vyhod">Выйти <Icon name="arrowRight" size={14} /></Link>
      </div>
    </nav>
  );
}
