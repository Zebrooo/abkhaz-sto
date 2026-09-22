"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StoRole } from "@/lib/access";
import { activeTab, ROUTE, TABS } from "@/lib/nav";
import { Icon, type IconName } from "@/components/Icon";

/**
 * Вкладки снизу на телефоне — по роли (lib/nav.ts): мастеру пост и осмотр,
 * админу смена с кнопкой «+», хозяину деньги и мастера. Клиентский код
 * здесь только ради подсветки текущей вкладки по адресу.
 */
export function TabBar({ role, newHref }: { role: StoRole; newHref: string }) {
  const active = activeTab(role, usePathname() ?? "/");
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS[role].map(t => t.key === "fab" ? (
        <Link key="fab" href={newHref} aria-label="Записать клиента">
          <span className="fab"><Icon name="plus" size={26} /></span>
        </Link>
      ) : (
        <Tab key={t.key} href={ROUTE[t.key]} label={t.label} icon={t.icon} on={active === t.key} />
      ))}
    </nav>
  );
}

function Tab({ href, label, icon, on }: { href: string; label: string; icon: IconName; on: boolean }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined}>
      <span className="ico"><Icon name={icon} size={22} /></span>
      <span className="lab">{label}</span>
    </Link>
  );
}
