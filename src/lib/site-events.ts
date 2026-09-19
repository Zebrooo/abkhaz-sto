import "server-only";
// Побочные эффекты переходов — на сайте (#1272): пуш и колокольчик клиенту,
// Telegram, проводки предоплаты умеет только сервер abkhaz-auto. Приложение
// сообщает ему о событии подписанным запросом (@zebrooo/service-ticket, как
// promo-bff). Пока /api/sto/* на сайте нет или адрес не задан — тихий
// пропуск с записью в лог: переход в базе уже сделан, и «не удалось» тут
// было бы враньём (тот же принцип, что у order-notify на сайте).
// Этим и отличается от lib/api/*: там ответ сайта — единственный источник
// данных, и «не ответил» обязано дойти до экрана; здесь — нет.
import { SERVICE_TICKET_HEADER } from "@zebrooo/service-ticket";
import { issueTicket, siteApiBase } from "@/lib/api/site-api";

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

/**
 * Дошло ли событие до сайта. Переход в базе от этого не зависит — он уже
 * сделан, — но экран обязан знать правду: «клиент получил пуш» при молчащем
 * сайте это враньё, из-за которого админ не позвонит клиенту сам.
 *
 * НИКОГДА НЕ БРОСАЕТ: вызовы идут и без await (void notifySite(...)), и
 * отвергнутый промис там стал бы unhandled rejection. Любой сбой — лог и
 * false, как при недоступном сайте.
 */
export async function notifySite(event: SiteBookingEvent): Promise<boolean> {
  try {
    const base = siteApiBase();
    const signed = issueTicket();
    if (!base || !signed) {
      console.warn("[сто] событие записи не отправлено на сайт: не задан адрес или ключ", event.event, event.bookingId);
      return false;
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    headers[SERVICE_TICKET_HEADER] = signed;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/api/sto/booking-event`, {
        method: "POST", headers, body: JSON.stringify(event), signal: ctrl.signal,
      });
      if (!res.ok) console.warn("[сто] сайт не принял событие записи:", res.status, event.event, event.bookingId);
      return res.ok;
    } catch (e) {
      console.warn("[сто] сайт недоступен для события записи:", e);
      return false;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Сюда попадает то, что вне fetch: например, подпись тикета упала на
    // кривом ключе из окружения.
    console.warn("[сто] событие записи не ушло на сайт:", e);
    return false;
  }
}
