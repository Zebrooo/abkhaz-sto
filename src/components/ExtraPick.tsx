"use client";
// Выбор услуги для «Добавить услугу» в карточке записи — тот же поиск, что
// ServicePick в «Записать клиента», но пункты не ссылки мастера, а кнопки
// отправки: услуга уезжает в addExtraAction полем listingId родительской
// формы. Клиентский компонент только ради фильтра по набору текста.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { matchesService } from "@/lib/booking-form";

export type ExtraPickItem = {
  listingId: number;
  title: string;
  /** Цена и длительность подстрокой, как в ServicePick. */
  sub: string;
};

/** До этого числа услуг поиск не нужен: список виден целиком (как в ServicePick). */
const MIN_FOR_SEARCH = 8;

export function ExtraPick({ items }: { items: ExtraPickItem[] }) {
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
            // Enter в поиске не должен отправлять первую услугу списка.
            onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
            placeholder="Найти услугу"
            aria-label="Найти услугу"
          />
        </div>
      )}
      <div className="svc-list">
        {shown.map(i => (
          <button key={i.listingId} className="pick" type="submit" name="listingId" value={i.listingId}>
            <div className="pick-main">
              <div className="pick-t">{i.title}</div>
              <div className="pick-s">{i.sub}</div>
            </div>
          </button>
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
