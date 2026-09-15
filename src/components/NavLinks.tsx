"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/segodnya", label: "Сегодня", ico: "📋" },
  { href: "/kalendar", label: "Календарь", ico: "📅" },
  { href: "/uslugi", label: "Услуги", ico: "🔧" },
  { href: "/raspisanie", label: "Расписание", ico: "🕘" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Разделы">
      {ITEMS.map(it => (
        <Link key={it.href} href={it.href} aria-current={path?.startsWith(it.href) ? "page" : undefined}>
          <span className="ico" aria-hidden="true">{it.ico}</span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
