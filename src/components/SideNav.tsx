"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StoRole } from "@/lib/access";
import { hrefOf, navKeyOf, sideNav } from "@/lib/nav";
import { Icon } from "@/components/Icon";

/**
 * Разделы слева — только на вебе; на телефоне их заменяют вкладки снизу.
 * Пункты — по роли (lib/nav.ts): у хозяина есть «Деньги» и «Доступы»,
 * у мастера — только осмотр и чат.
 */
export function SideNav({ role, siteUrl, unread, inspectHref }: { role: StoRole; siteUrl: string; unread: number; inspectHref: string }) {
  const current = navKeyOf(usePathname() ?? "/");
  return (
    <nav className="side" aria-label="Разделы">
      {sideNav(role).map(it => {
        const on = it.key === current;
        const count = it.key === "notifs" ? unread : 0;
        return (
          <Link key={it.key} href={hrefOf(it.key, inspectHref)} aria-current={on ? "page" : undefined}>
            <Icon name={it.icon} size={18} />
            <span className="n">{it.label}</span>
            {count > 0 && <span className="c">{count}</span>}
          </Link>
        );
      })}
      <div className="side-foot">
        <p>Записи с сайта приходят сюда сразу. Вход — общий с abkhaz-auto.ru.</p>
        <a href={siteUrl} target="_blank" rel="noreferrer">Витрина на сайте <Icon name="arrowRight" size={14} /></a>
      </div>
    </nav>
  );
}
