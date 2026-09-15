import "server-only";
// Побочные эффекты переходов — на сайте (#1272): пуш и колокольчик клиенту,
// Telegram, проводки предоплаты умеет только сервер abkhaz-auto. Приложение
// сообщает ему о событии подписанным запросом (@zebrooo/service-ticket, как
// promo-bff). Пока /api/sto/* на сайте нет или адрес не задан — тихий
// пропуск с записью в лог: переход в базе уже сделан, и «не удалось» тут
// было бы враньём (тот же принцип, что у order-notify на сайте).
import { issueServiceTicket, SERVICE_TICKET_HEADER } from "@zebrooo/service-ticket";

export type SiteBookingEvent = {
  bookingId: number;
  shopId: number;
  /** Что случилось: переход или перенос. */
  event: "confirmed" | "done" | "no_show" | "cancelled" | "rescheduled" | "created";
  actorUserId: string;
  /** Для переноса — новое время; для отмены — причина. */
  details?: Record<string, unknown>;
};

const TIMEOUT_MS = 2_500;

export async function notifySite(event: SiteBookingEvent): Promise<void> {
  const base = process.env.SITE_INTERNAL_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const privateKey = process.env.STO_TICKET_PRIVATE_KEY;
  if (!base || !privateKey) {
    console.warn("[сто] событие записи не отправлено на сайт: не задан адрес или ключ", event.event, event.bookingId);
    return;
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers[SERVICE_TICKET_HEADER] = issueServiceTicket({
    src: process.env.STO_TICKET_SRC ?? "abkhaz-sto",
    dst: process.env.STO_TICKET_DST ?? "abkhaz-auto",
    privateKey,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/sto/booking-event`, {
      method: "POST", headers, body: JSON.stringify(event), signal: ctrl.signal,
    });
    if (!res.ok) console.warn("[сто] сайт не принял событие записи:", res.status, event.event, event.bookingId);
  } catch (e) {
    console.warn("[сто] сайт недоступен для события записи:", e);
  } finally {
    clearTimeout(timer);
  }
}
