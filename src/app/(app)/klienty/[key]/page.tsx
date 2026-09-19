import Link from "next/link";
import { notFound } from "next/navigation";
import { saveClientNoteAction } from "@/app/(app)/zametki-actions";
import { bookingsOfClient, countPending } from "@/lib/bookings";
import { fetchClientNotes } from "@/lib/api/client-notes";
import { fetchGarage } from "@/lib/api/garage";
import { requireSection } from "@/lib/context";
import { clientCard } from "@/lib/clients";
import { clientVehicles, vehicleName } from "@/lib/vehicles";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { STATUS_SHORT } from "@/components/Status";
import { count, dayShort, formatPhone, formatRub, initials, relativeAt, rub, todayLocal } from "@/lib/format";
import { localDay } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const NOTE_FORM = "client-note";

/**
 * Карточка клиента: контакты, его машины и история записей — всё собрано из
 * снимков самих записей. Машины — ссылки на свои карточки (lib/vehicles.ts):
 * у человека их бывает несколько, и «что делали этой» — отдельный вопрос.
 * «Гараж на сайте» — то, чем клиент ездит сейчас (api/garage.ts): снимок в
 * записи говорит, на чём приезжали тогда, и меняться задним числом не должен. Экран один на телефон и веб: на вебе заголовок
 * рисует `.head`, остальное читается той же колонкой. Заметка сервиса —
 * единственное своё: она живёт на сайте по тому же ключу (lib/api/client-notes.ts)
 * и правится шторкой ?do=note.
 */
export default async function ClientPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SP }) {
  const { key } = await params;
  const sp = await searchParams;
  const ctx = (await requireSection("clients"))!;
  const { shop } = ctx;
  // Записи одного клиента, а не вся история сервиса: ключ в SQL повторяется
  // только для учётки, остальное дожимает clientKey в bookingsOfClient.
  const [rows, pending] = await Promise.all([bookingsOfClient(shop.id, key), countPending(shop.id)]);
  // Из адреса ключ приходит раскодированным, а clientKey кодирует имя —
  // поэтому пробуем оба вида, иначе клиент без телефона не находится.
  const card = clientCard(rows, key) ?? clientCard(rows, encodeURIComponent(key));
  if (!card) notFound();
  const visits = count(card.visits, "запись", "записи", "записей");

  // Заметку спрашиваем по ключу карточки: он совпадает с тем, что строит
  // clientKey, даже если в адресе имя пришло раскодированным.
  // Гараж — актуальные машины из учётки клиента; маршрута на сайте пока нет,
  // и пустой ответ здесь обычное дело: блок просто не рисуется.
  const [notesRes, garageRes] = await Promise.all([
    fetchClientNotes({ shopId: shop.id, actorUserId: ctx.userId, keys: [card.key] }),
    fetchGarage({
      shopId: shop.id,
      actorUserId: ctx.userId,
      clientUserId: card.key.startsWith("u") ? card.key.slice(1) : null,
      phone: card.phone,
    }),
  ]);
  // Машины клиента: у карточки машины свой адрес, и туда ведут ссылки ниже.
  const cars = clientVehicles(rows, card.key);
  const garage = garageRes.ok ? garageRes.data : [];
  const note = notesRes.ok ? (notesRes.data.find(n => n.clientKey === card.key) ?? null) : null;
  const notesFailed = !notesRes.ok && notesRes.code !== "not_found" ? notesRes.error : null;
  const self = (q = "") => `/klienty/${card.key}${q}`;

  return (
    <>
      <ScreenHead title={card.name} sub={visits} back="/klienty" unread={pending} />
      <div className="page page-card stack">
        <div className="head">
          <div>
            <div className="head-t">{card.name}</div>
            <div className="head-s">{visits} · {rub(card.spent)} по выполненным</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--outline aui-btn--md" href="/klienty">Все клиенты</Link>
          </div>
        </div>
        <Flash ok={pick(sp.ok)} err={pick(sp.do) === "note" ? "" : pick(sp.err)} />

        <div className="card hero">
          <span className="ava ava-accent">{initials(card.name)}</span>
          <div>
            <div className="hero-n">{card.name}</div>
            <div className="hero-s">{formatPhone(card.phone) || "телефон не оставил"}</div>
          </div>
          <div className="hero-actions">
            {card.phone && (
              <>
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={`tel:${card.phone}`}>Позвонить</a>
                <a className="aui-btn aui-btn--secondary aui-btn--md" href={`sms:${card.phone}`}>Написать</a>
              </>
            )}
            <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/kalendar/novaya?d=${todayLocal()}&client=${encodeURIComponent(card.key)}`}>Записать</Link>
          </div>
        </div>

        {cars.length > 0 && (
          <>
            <div className="sect">Машины</div>
            {cars.map(c => (
              <Link key={c.key} className="card card-sm thing" href={`/mashiny/${c.key}`}>
                <span className="sq"><Icon name="car" size={22} /></span>
                <div className="row-main">
                  <div className="thing-n">{c.name}</div>
                  <div className="thing-s">
                    {[count(c.visits, "запись", "записи", "записей"), `последняя ${relativeAt(c.lastAt)}`,
                      c.vin ? `VIN ${c.vin}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {c.plate && <span className="rspec">{c.plate}</span>}
              </Link>
            ))}
          </>
        )}

        {garage.length > 0 && (
          <>
            <div className="sect">Гараж на сайте</div>
            {garage.map(g => (
              <div key={g.id} className="card card-sm thing">
                <span className="sq"><Icon name="garage" size={22} /></span>
                <div className="row-main">
                  <div className="thing-n">{vehicleName(g)}</div>
                  <div className="thing-s">{g.vin ? `VIN ${g.vin}` : "VIN не указан"}</div>
                </div>
                {g.plate && <span className="rspec">{g.plate}</span>}
              </div>
            ))}
            <p className="hint">Чем клиент ездит сейчас — из его учётки. Выше — машины, на которых он к нам приезжал.</p>
          </>
        )}

        <div className="sect">История записей</div>
        <div className="card card-flat">
          {card.history.map(b => (
            <Link key={b.id} className="hist" href={`/zapis/${b.id}`}>
              <span className="d">{dayShort(localDay(new Date(b.starts_at)))}</span>
              <span className="t">{b.service.title}</span>
              {b.status === "cancelled" || b.status === "no_show"
                ? <span className="s s-off">{STATUS_SHORT[b.status]}</span>
                : <span className="s">{formatRub(b.service.price)}</span>}
            </Link>
          ))}
        </div>

        <Link className="card-warm note-card" href={self("?do=note")}>
          <div className="eyebrow eyebrow-accent">Заметка сервиса</div>
          {note?.text ? (
            <>
              <div className="note-txt">{note.text}</div>
              <div className="note-by">{[note.authorName, relativeAt(note.updatedAt)].filter(Boolean).join(" · ")}</div>
            </>
          ) : (
            <div className="note-txt note-empty">
              {notesFailed ?? "Что помнить о клиенте: как звонить, что привозит своё. Нажмите, чтобы записать."}
            </div>
          )}
        </Link>
      </div>

      {pick(sp.do) === "note" && (
        <Sheet
          closeHref={self()}
          title="Заметка сервиса"
          sub={card.name}
          footer={
            <>
              <Link className="aui-btn aui-btn--secondary aui-btn--lg" href={self()}>Отмена</Link>
              <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={NOTE_FORM}>Сохранить</button>
            </>
          }
        >
          {/* Форма живёт в теле, а кнопка — в подвале шторки: их связывает form=. */}
          <form id={NOTE_FORM} action={saveClientNoteAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <input type="hidden" name="clientKey" value={card.key} />
            <label className="fld">
              <span>Видит только сервис</span>
              <textarea name="text" placeholder="Просит звонить после 18:00. Масло привозит своё." defaultValue={note?.text ?? ""} maxLength={1000} />
            </label>
            <p className="sheet-note">Пустая заметка стирается.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
