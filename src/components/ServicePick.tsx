"use client";
// Поиск по списку услуг в «Записать клиента»: услуг под сотню, и глазами по
// плоскому списку нужную уже не найти. Печатаешь — список тут же сужается.
//
// Клиентский компонент по той же причине, что и ClientPick: фильтр живёт от
// набора текста, а не от перехода по адресу, и гонять экран на сервер за
// каждой буквой — терять набранное. Сами пункты остаются серверными ссылками
// мастера (день, пост и окно в адресе) — компонент получает их готовыми и
// только решает, какие показать.
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { matchesService } from "@/lib/booking-form";

/** Пункт списка: всё уже посчитано на сервере, включая адрес перехода. */
export type ServicePickItem = {
  listingId: number;
  title: string;
  /** Подстрока под названием: цена и длительность. */
  sub: string;
  href: string;
  selected: boolean;
};

/** До этого числа услуг поиск не нужен: список виден целиком. */
const MIN_FOR_SEARCH = 8;

export function ServicePick({ items }: { items: ServicePickItem[] }) {
  const [q, setQ] = useState("");
  const shown = items.filter(i => matchesService(i.title, q));
  return (
    <>
      {items.length >= MIN_FOR_SEARCH && (
        <div className="search svc-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            // Enter в поиске не должен отправлять форму записи целиком.
            onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
            placeholder="Найти услугу"
            aria-label="Найти услугу"
          />
        </div>
      )}
      {/* Своя обёртка вокруг пунктов: на вебе колонка услуг зажата в экран,
          и прокручивается именно список — поиск остаётся над ним. */}
      <div className="svc-list">
        {shown.map(i => (
          <Link key={i.listingId} className="pick" href={i.href} aria-pressed={i.selected}>
            <div className="pick-main">
              <div className="pick-t">{i.title}</div>
              <div className="pick-s">{i.sub}</div>
            </div>
            {i.selected && <span className="pick-on"><Icon name="check" size={15} /></span>}
          </Link>
        ))}
        {shown.length === 0 && (
          <p className="hint">
            По запросу «{q.trim()}» ничего не нашлось —{" "}
            <button type="button" onClick={() => setQ("")}>сбросить</button>
          </p>
        )}
      </div>
    </>
  );
}
