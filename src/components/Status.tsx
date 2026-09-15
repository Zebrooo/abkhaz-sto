import type { StoBookingStatus } from "@/lib/sto/types";

/**
 * Короткая подпись статуса — для бейджа на карточке и в таймлайне.
 * Длинные подписи (STO_BOOKING_STATUS_LABEL) — копия сайта, их не трогаем.
 */
export const STATUS_SHORT: Record<StoBookingStatus, string> = {
  new: "ждёт",
  confirmed: "подтверждена",
  done: "выполнена",
  cancelled: "отменена",
  no_show: "не приехал",
};

const BADGE: Record<StoBookingStatus, string> = {
  new: "aui-badge is-tag-urgent",
  confirmed: "aui-badge is-tag-free",
  done: "aui-badge is-tag-neg",
  cancelled: "aui-badge",
  no_show: "aui-badge",
};

export function StatusBadge({ status, className }: { status: StoBookingStatus; className?: string }) {
  return <span className={`${BADGE[status]}${className ? ` ${className}` : ""}`}>{STATUS_SHORT[status]}</span>;
}
