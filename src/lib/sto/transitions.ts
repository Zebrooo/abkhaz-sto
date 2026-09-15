// Переходы записи — чистое правило, одно для приложения и (тем же текстом)
// для сайта, чтобы кабинет клиента и календарь сервиса не разошлись.
import type { StoBookingStatus, StoCancelledBy } from "./types";

export type StoTransition = "confirm" | "done" | "no_show" | "cancel";

/** Что может сделать сервис из каждого статуса. */
const SHOP_NEXT: Record<StoBookingStatus, StoTransition[]> = {
  new: ["confirm", "cancel"],
  confirmed: ["done", "no_show", "cancel"],
  done: [],
  cancelled: [],
  no_show: [],
};

export const TRANSITION_LABEL: Record<StoTransition, string> = {
  confirm: "Подтвердить",
  done: "Выполнено",
  no_show: "Не приехал",
  cancel: "Отменить",
};

export function shopTransitions(status: StoBookingStatus): StoTransition[] {
  return SHOP_NEXT[status];
}

export function statusAfter(t: StoTransition): StoBookingStatus {
  switch (t) {
    case "confirm": return "confirmed";
    case "done": return "done";
    case "no_show": return "no_show";
    case "cancel": return "cancelled";
  }
}

/** Патч строки для перехода сервисом; null — переход из этого статуса невозможен. */
export function shopTransitionPatch(status: StoBookingStatus, t: StoTransition):
  | { status: StoBookingStatus; cancelled_by: StoCancelledBy | null }
  | null {
  if (!SHOP_NEXT[status].includes(t)) return null;
  const next = statusAfter(t);
  return { status: next, cancelled_by: next === "cancelled" ? "shop" : null };
}

/** Перенос возможен только у живой записи. */
export function canReschedule(status: StoBookingStatus): boolean {
  return status === "new" || status === "confirmed";
}
