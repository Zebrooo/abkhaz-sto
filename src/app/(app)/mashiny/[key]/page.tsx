import Link from "next/link";
import { notFound } from "next/navigation";
import { countPending, recentBookings } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { fetchGarage } from "@/lib/api/garage";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { STATUS_SHORT } from "@/components/Status";
import { count, dayShort, formatPhone, formatRub, relativeAt, rub, todayLocal } from "@/lib/format";
import { localDay } from "@/lib/sto/slots";
import { normalizePlate, vehicleCard, vehicleName } from "@/lib/vehicles";

/**
 * Карточка машины: чья она, что ей делали и на сколько. Собирается из тех же
 * записей, что и карточка клиента (lib/vehicles.ts) — своей базы машин у
 * приложения нет.
 *
 * Зачем отдельно от человека: у одного клиента машин несколько, «масло менял
 * в июне» — это про конкретную; а машину ещё и продают, и история ремонта
 * остаётся при ней, поэтому владельцы здесь списком.
 *
 * «Гараж на сайте» — актуальные данные из учётки клиента (api/garage.ts):
 * снимок в записи говорит, на чём приезжали тогда, гараж — чем ездят сейчас.
 * Маршрута на сайте пока нет, поэтому блок просто не рисуется.
 */
export default async function VehiclePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = (await requireSection("clients"))!;
  const { shop } = ctx;
  const rows = await recentBookings(shop.id);
  // Ключ без номера кодирует имя машины — из адреса он приходит раскодированным.
  const card = vehicleCard(rows, key) ?? vehicleCard(rows, encodeURIComponent(key));
  if (!card) notFound();
  const pending = await countPending(shop.id);
  const visits = count(card.visits, "запись", "записи", "записей");

  // Гараж спрашиваем у свежего владельца: он на этой машине ездит сейчас.
  const owner = card.owners[0];
  const garageRes = await fetchGarage({
    shopId: shop.id,
    actorUserId: ctx.userId,
    clientUserId: owner?.key.startsWith("u") ? owner.key.slice(1) : null,
    phone: owner?.phone ?? null,
  });
  // Из гаража берём только эту машину: остальные — не про эту карточку.
  const inGarage = garageRes.ok
    ? garageRes.data.find(g => (card.plate && normalizePlate(g.plate) === card.plate)
        || (!card.plate && vehicleName(g) === card.name))
    : undefined;

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
          <span className="sq"><Icon name="car" size={22} /></span>
          <div>
            <div className="hero-n">{card.name}</div>
            <div className="hero-s">
              {[card.plate, `последний визит ${relativeAt(card.lastAt)}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="hero-actions">
            <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/kalendar/novaya?d=${todayLocal()}`}>Записать</Link>
          </div>
        </div>

        <div className="sect">{card.owners.length > 1 ? "Владельцы" : "Владелец"}</div>
        {card.owners.map(o => (
          <Link key={o.key} className="card card-sm thing" href={`/klienty/${o.key}`}>
            <span className="sq"><Icon name="shop" size={22} /></span>
            <div className="row-main">
              <div className="thing-n">{o.name}</div>
              <div className="thing-s">
                {[formatPhone(o.phone) || "телефон не оставил", `приезжал ${relativeAt(o.lastAt)}`].join(" · ")}
              </div>
            </div>
            <Icon name="chevron" size={16} />
          </Link>
        ))}
        {card.owners.length > 1 && (
          <p className="hint">Машину продали: история ремонта остаётся при ней, а не уходит с прежним хозяином.</p>
        )}

        {inGarage && (
          <>
            <div className="sect">Гараж на сайте</div>
            <div className="card card-sm thing">
              <span className="sq"><Icon name="garage" size={22} /></span>
              <div className="row-main">
                <div className="thing-n">{vehicleName(inGarage)}</div>
                <div className="thing-s">
                  {[inGarage.plate, inGarage.vin ? `VIN ${inGarage.vin}` : null].filter(Boolean).join(" · ") || "номер не указан"}
                </div>
              </div>
            </div>
            <p className="hint">Актуальные данные из учётки клиента. В истории ниже — то, на чём приезжали тогда.</p>
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
