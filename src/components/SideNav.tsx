"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Смена", icon: "chart", match: p => p === "/" },
  { href: "/segodnya", label: "Записи", icon: "list", match: p => p.startsWith("/segodnya") || p.startsWith("/kalendar") || p.startsWith("/zapis") },
  { href: "/klienty", label: "Клиенты", icon: "users", match: p => p.startsWith("/klienty") },
  { href: "/uslugi", label: "Услуги и цены", icon: "wrench", match: p => p.startsWith("/uslugi") },
  { href: "/raspisanie", label: "Расписание", icon: "clock", match: p => p.startsWith("/raspisanie") },
  { href: "/uvedomleniya", label: "Уведомления", icon: "bell", match: p => p.startsWith("/uvedomleniya") },
];

/** Разделы слева — только на вебе; на телефоне их заменяют вкладки снизу. */
export function SideNav({ siteUrl, unread }: { siteUrl: string; unread: number }) {
  const path = usePathname() ?? "/";
  return (
    <nav className="side" aria-label="Разделы">
      {ITEMS.map(it => {
        const on = it.match(path);
        const count = it.href === "/uvedomleniya" ? unread : 0;
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}>
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
