import Link from "next/link";
import { notFound } from "next/navigation";
import { countPending, recentBookings } from "@/lib/bookings";
import { currentServiceShop } from "@/lib/shop";
import { clientCard } from "@/lib/clients";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { STATUS_SHORT } from "@/components/Status";
import { count, dayShort, formatPhone, formatRub, initials, rub, todayLocal } from "@/lib/format";
import { localDay } from "@/lib/sto/slots";

/**
 * Карточка клиента: контакты, его машины и история записей — всё собрано из
 * снимков самих записей. Экран один на телефон и веб: на вебе заголовок
 * рисует `.head`, остальное читается той же колонкой.
 */
export default async function ClientPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const shop = (await currentServiceShop())!;
  const rows = await recentBookings(shop.id);
  // Из адреса ключ приходит раскодированным, а clientKey кодирует имя —
  // поэтому пробуем оба вида, иначе клиент без телефона не находится.
  const card = clientCard(rows, key) ?? clientCard(rows, encodeURIComponent(key));
  if (!card) notFound();
  const pending = await countPending(shop.id);
  const visits = count(card.visits, "запись", "записи", "записей");

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
            <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/kalendar/novaya?d=${todayLocal()}`}>Записать</Link>
          </div>
        </div>

        {card.cars.length > 0 && (
          <>
            <div className="sect">Машины</div>
            {card.cars.map(c => {
              // carMeta склеивает год и номер, а номер стоит чипом справа —
              // в подписи оставляем только то, чего в чипе нет.
              const meta = c.meta.split(" · ").filter(p => p !== c.plate).join(" · ");
              return (
                <div key={c.name} className="card card-sm thing">
                  <span className="sq"><Icon name="car" size={22} /></span>
                  <div className="row-main">
                    <div className="thing-n">{c.name}</div>
                    {meta && <div className="thing-s">{meta}</div>}
                  </div>
                  {c.plate && <span className="rspec">{c.plate}</span>}
                </div>
              );
            })}
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
      </div>
    </>
  );
}
