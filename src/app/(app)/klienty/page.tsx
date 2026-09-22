import Link from "next/link";
import { clientHistoryRows, countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { matchClient, summarizeClients, type ClientSummary } from "@/lib/clients";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { agoLabel, count, formatPhone, initials, plural } from "@/lib/format";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Постоянный — кто приезжал хотя бы дважды, новый — кто был один раз. */
const FILTERS = [["all", "Все"], ["reg", "Постоянные"], ["new", "Новые"]] as const;
type Filter = (typeof FILTERS)[number][0];
const isFilter = (s: string): s is Filter => FILTERS.some(([k]) => k === s);
const keep = (c: ClientSummary, f: Filter) => f === "all" || (f === "reg" ? c.visits > 1 : c.visits === 1);

function href(q: string, f: Filter): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (f !== "all") sp.set("f", f);
  const s = sp.toString();
  return s ? `/klienty?${s}` : "/klienty";
}

function Chips({ q, filter, counts }: { q: string; filter: Filter; counts: Record<Filter, number> }) {
  return (
    <div className="chips">
      {FILTERS.map(([key, label]) => (
        <Link key={key} className="chip" href={href(q, key)} aria-current={key === filter ? "page" : undefined}>
          {label} {counts[key]}
        </Link>
      ))}
    </div>
  );
}

/**
 * Клиенты — свод по записям сервиса: своей базы клиентов нет, карточка
 * собирается из снимков записи (lib/clients). На телефоне это список строк
 * с поиском, на вебе — таблица; фильтр и поиск живут в адресе, поэтому
 * экран остаётся серверным.
 */
export default async function ClientsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Гейт по роли: раздел закрыт — requireSection уводит на первый экран роли.
  const ctx = (await requireSection("clients"))!;
  const shop = ctx.shop;
  // Узкая выборка: своду нужны снимки и услуга, а не data целиком (bookings.ts).
  const [rows, pending] = await Promise.all([clientHistoryRows(shop.id), countPending(shop.id)]);

  const q = pick(sp.q).trim();
  const f = pick(sp.f);
  const filter: Filter = isFilter(f) ? f : "all";

  const all = summarizeClients(rows);
  // Чипы считают найденное, а не всю базу: иначе «Новые 12» рядом с пустым
  // списком после поиска выглядит ошибкой.
  const found = q ? all.filter(c => matchClient(c, q)) : all;
  const counts: Record<Filter, number> = {
    all: found.length,
    reg: found.filter(c => c.visits > 1).length,
    new: found.filter(c => c.visits === 1).length,
  };
  const visible = found.filter(c => keep(c, filter));
  const regular = all.filter(c => c.visits > 1).length;

  return (
    <>
      <ScreenHead title="Клиенты" sub={count(all.length, "карточка", "карточки", "карточек")} unread={pending} />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Клиенты</div>
            <div className="head-s">
              {count(all.length, "карточка", "карточки", "карточек")} · {regular} {plural(regular, "постоянный", "постоянных", "постоянных")}
              {" · "}карточка собирается из записей сервиса и живёт, пока есть хотя бы одна
            </div>
          </div>
          <div className="head-tail">
            <Chips q={q} filter={filter} counts={counts} />
          </div>
        </div>

        <div className="cli-ctl">
          <form className="search" method="get" action="/klienty">
            <Icon name="search" size={18} />
            <input name="q" defaultValue={q} placeholder="Имя, телефон, номер или VIN" aria-label="Поиск клиента" />
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          </form>
          <Chips q={q} filter={filter} counts={counts} />
        </div>

        {visible.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="users" size={26} /></span>
            <div className="empty-t">{all.length === 0 ? "Клиентов пока нет" : "Никого не нашли"}</div>
            <div className="empty-s">
              {all.length === 0
                ? "Карточка заводится сама: как только человек запишется с сайта или вы запишете его вручную, он появится здесь."
                : "Поиск идёт по имени, телефону, машине, госномеру и VIN. Попробуйте короче — например, три цифры номера."}
            </div>
            {all.length > 0 && <Link className="aui-btn aui-btn--outline aui-btn--md" href="/klienty">Показать всех</Link>}
          </div>
        ) : (
          <>
            <div className="card card-flat cli-list">
              {visible.map(c => (
                <Link key={c.key} className="row cli" href={`/klienty/${c.key}`}>
                  <span className="ava">{initials(c.name)}</span>
                  <div className="row-main">
                    <div className="row-t">{c.name}</div>
                    <div className="row-s">{[c.car, c.plate, formatPhone(c.phone)].filter(Boolean).join(" · ") || "ни машины, ни телефона"}</div>
                  </div>
                  <div className="cli-tail">
                    <div className="cli-n">{count(c.visits, "запись", "записи", "записей")}</div>
                    <div className="cli-at">{agoLabel(c.lastAt)}</div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="table">
              <div className="th">
                <span>Клиент</span><span>Телефон</span><span>Машина</span><span>Записей</span><span>Последний визит</span><span />
              </div>
              {visible.map(c => (
                <Link key={c.key} className="tr" href={`/klienty/${c.key}`}>
                  <span className="who">
                    <span className="ava">{initials(c.name)}</span>
                    <span>{c.name}</span>
                  </span>
                  <span className="cell num">{formatPhone(c.phone) || "—"}</span>
                  <span className="cell">{c.car ?? "—"}</span>
                  <span className="cell">{count(c.visits, "запись", "записи", "записей")}</span>
                  <span className="cell cell-mut">{agoLabel(c.lastAt)}</span>
                  <span className="chev"><Icon name="chevron" size={16} /></span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
