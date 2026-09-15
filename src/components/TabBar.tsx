"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const ITEMS: { href: string; label: string; icon: IconName; key: string }[] = [
  { href: "/", label: "Смена", icon: "chart", key: "smena" },
  { href: "/segodnya", label: "Записи", icon: "list", key: "zapisi" },
  { href: "/klienty", label: "Клиенты", icon: "users", key: "klienty" },
  { href: "/menu", label: "Ещё", icon: "menu", key: "menu" },
];

/** Какой вкладке принадлежит адрес: запись и календарь живут под «Записями». */
function activeKey(path: string): string {
  if (path === "/") return "smena";
  if (path.startsWith("/segodnya") || path.startsWith("/kalendar") || path.startsWith("/zapis")) return "zapisi";
  if (path.startsWith("/klienty")) return "klienty";
  return "menu";
}

export function TabBar({ newHref }: { newHref: string }) {
  const active = activeKey(usePathname() ?? "/");
  const [left, right] = [ITEMS.slice(0, 2), ITEMS.slice(2)];
  return (
    <nav className="tabbar" aria-label="Разделы">
      {left.map(it => <Tab key={it.key} href={it.href} label={it.label} icon={it.icon} on={active === it.key} />)}
      <Link href={newHref} aria-label="Записать клиента">
        <span className="fab"><Icon name="plus" size={26} /></span>
      </Link>
      {right.map(it => <Tab key={it.key} href={it.href} label={it.label} icon={it.icon} on={active === it.key} />)}
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
