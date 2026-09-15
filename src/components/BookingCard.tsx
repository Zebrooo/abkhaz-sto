import Link from "next/link";
import type { StoBookingRow } from "@/lib/sto/types";
import { STO_BOOKING_STATUS_LABEL } from "@/lib/sto/types";
import { shopTransitions, TRANSITION_LABEL, canReschedule } from "@/lib/sto/transitions";
import { formatRub, timeRange } from "@/lib/format";
import { localDay } from "@/lib/sto/slots";
import { transitionAction } from "@/app/(app)/actions";

/** Кто приедет: клиент с учётки (пока только id — имя подтянет #1272) или снимок ручной записи. */
function clientLine(b: StoBookingRow): string {
  if (b.data.client) return [b.data.client.name, b.data.client.phone].filter(Boolean).join(" · ");
  return b.client_id ? "Клиент с сайта" : "Клиент";
}

function vehicleLine(b: StoBookingRow): string | null {
  const v = b.data.vehicle;
  if (!v) return null;
  return [v.brand, v.model, v.year ? String(v.year) : null, v.plate].filter(Boolean).join(" ");
}

export function BookingCard({ b, returnTo }: { b: StoBookingRow; returnTo: string }) {
  const transitions = shopTransitions(b.status);
  const day = localDay(new Date(b.starts_at));
  return (
    <article className="card">
      <div className="row">
        <span className="title">{timeRange(b.starts_at, b.ends_at)} · пост {b.post_no}</span>
        <span className={`badge badge-${b.status}`}>{STO_BOOKING_STATUS_LABEL[b.status]}</span>
      </div>
      <div className="stack" style={{ marginTop: 6 }}>
        <div>{b.service.title} <span className="muted">· {formatRub(b.service.price)} · {b.service.durationMin} мин</span></div>
        <div className="small">{clientLine(b)}</div>
        {vehicleLine(b) && <div className="small muted">{vehicleLine(b)}</div>}
        {b.data.comment && <div className="small muted">«{b.data.comment}»</div>}
        {b.prepay_amount > 0 && <div className="small">Предоплата {formatRub(b.prepay_amount)} · {b.prepay_status}</div>}
        {b.data.cancelReason && <div className="small muted">Причина: {b.data.cancelReason}</div>}
      </div>
      {(transitions.length > 0 || canReschedule(b.status)) && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          {transitions.filter(t => t !== "cancel").map(t => (
            <form key={t} action={transitionAction}>
              <input type="hidden" name="shopId" value={b.shop_id} />
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="transition" value={t} />
              <input type="hidden" name="return" value={returnTo} />
              <button className={`btn btn-sm ${t === "confirm" ? "btn-success" : ""}`} type="submit">{TRANSITION_LABEL[t]}</button>
            </form>
          ))}
          {canReschedule(b.status) && (
            <Link className="btn btn-sm" href={`/kalendar?d=${day}&move=${b.id}`}>Перенести</Link>
          )}
          {transitions.includes("cancel") && (
            <details>
              <summary className="btn btn-sm">Отменить</summary>
              <form action={transitionAction} className="stack" style={{ marginTop: 8 }}>
                <input type="hidden" name="shopId" value={b.shop_id} />
                <input type="hidden" name="bookingId" value={b.id} />
                <input type="hidden" name="transition" value="cancel" />
                <input type="hidden" name="return" value={returnTo} />
                <label className="fld"><span>Причина (увидит клиент)</span><input name="reason" maxLength={300} placeholder="например, мастер заболел" /></label>
                <button className="btn btn-sm" type="submit">Отменить запись</button>
              </form>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
