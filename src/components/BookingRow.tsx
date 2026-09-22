import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import { StatusBadge } from "@/components/Status";
import { BookingGrip } from "@/components/CalendarDrag";
import { bookingPrice } from "@/lib/booking-extras";
import { formatRub, shortName, timeRange } from "@/lib/format";
import { transitionAction } from "@/app/(app)/actions";

/** Кто приедет: снимок ручной записи или клиент с учётки сайта. */
export function clientName(b: StoBookingRow): string {
  return b.data.client?.name?.trim() || (b.client_id ? "Клиент с сайта" : "Клиент");
}

/** Машина одной строкой: «Lada Vesta 2021». */
export function vehicleLine(b: StoBookingRow): string | null {
  const v = b.data.vehicle;
  if (!v) return null;
  return [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || null;
}

/**
 * Запись в списке. «pending» — та, что ждёт ответа: справа цена, снизу
 * подтвердить и перенести. «day» — обычная: справа статус, снизу цена.
 */
export function BookingRow({ b, variant = "day", returnTo, day }: {
  b: StoBookingRow;
  variant?: "pending" | "day";
  returnTo: string;
  day: string;
}) {
  const meta = [shortName(clientName(b)), vehicleLine(b)].filter(Boolean).join(" · ");
  const href = `/zapis/${b.id}?d=${day}`;
  return (
    <article className="card card-sm bk bk-card">
      {/* Ручка переноса — только в календаре: вне его провайдера нет и
          BookingGrip ничего не рисует. */}
      <BookingGrip bookingId={b.id} />
      <Link href={href} className="bk-link">
        <div className="bk-head">
          <span className="bk-time">{timeRange(b.starts_at, b.ends_at)}</span>
          <span className="rspec">пост {b.post_no}</span>
          {variant === "pending"
            ? <span className="bk-price">{formatRub(b.service.price)}</span>
            : <StatusBadge status={b.status} className="bk-badge" />}
        </div>
        <div className="bk-title">{b.service.title}</div>
        <div className="bk-foot">
          <span className="bk-meta">{meta}</span>
          {/* Вместе с добавленным по ходу работы — та цифра, что и в карточке. */}
          {variant === "day" && <span className="bk-price">{formatRub(bookingPrice(b))}</span>}
        </div>
      </Link>
      {variant === "pending" && (
        <div className="bk-actions">
          <form action={transitionAction}>
            <input type="hidden" name="shopId" value={b.shop_id} />
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="transition" value="confirm" />
            <input type="hidden" name="return" value={returnTo} />
            <button className="aui-btn aui-btn--primary aui-btn--md" type="submit">Подтвердить</button>
          </form>
          <Link className="aui-btn aui-btn--outline aui-btn--md" href={`/kalendar?d=${day}&move=${b.id}`}>Перенести</Link>
        </div>
      )}
    </article>
  );
}
