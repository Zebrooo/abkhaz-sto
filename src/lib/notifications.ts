// Лента уведомлений — тоже свод по записям, а не отдельная таблица: пуш и
// Telegram шлёт сайт (site-events.ts), а здесь экран показывает то, что уже
// видно в базе: новые записи с сайта, отмены клиентом, движение предоплаты.
// Событий, которых нет в строке записи, мы не выдумываем.
import type { StoBookingRow } from "@/lib/sto/types";
import type { IconName } from "@/components/Icon";

export type Notification = {
  id: string;
  bookingId: number;
  icon: IconName;
  /** Красная полоска слева и тёплый кружок — то, что требует ответа. */
  accent: boolean;
  title: string;
  text: string;
  /** Момент события (ISO) — подпись считает экран. */
  at: string;
  /** Можно подтвердить прямо из ленты. */
  canConfirm: boolean;
};

function who(b: StoBookingRow): string {
  const name = b.data.client?.name?.trim();
  if (name) return name;
  return b.client_id ? "Клиент с сайта" : "Клиент";
}

function when(b: StoBookingRow, timeRange: (a: string, z: string) => string): string {
  return `${timeRange(b.starts_at, b.ends_at)}, пост ${b.post_no}`;
}

/**
 * Лента по записям сервиса, свежее сверху. timeRange передаётся снаружи,
 * чтобы модуль остался чистым и проверяемым.
 */
export function buildFeed(
  rows: readonly StoBookingRow[],
  timeRange: (a: string, z: string) => string,
): Notification[] {
  const out: Notification[] = [];
  for (const b of rows) {
    if (b.status === "new") {
      out.push({
        id: `new-${b.id}`, bookingId: b.id, icon: "car", accent: true,
        title: b.source === "site" ? "Новая запись с сайта" : "Новая запись",
        // «без VIN» — подсказка админу вписать его с кузова при приёмке
        // (спека abkhaz-auto 2026-09-22-sto-booking-garage-vin): у записи
        // без VIN на карточке ждёт блок «VIN не указан».
        text: `${who(b)} · ${b.service.title} · ${when(b, timeRange)}${b.data.vehicle?.vin ? "" : " · без VIN"}`,
        at: b.created_at, canConfirm: true,
      });
      continue;
    }
    if (b.status === "cancelled" && b.cancelled_by === "client") {
      out.push({
        id: `cancel-${b.id}`, bookingId: b.id, icon: "bell", accent: false,
        title: "Отмена клиентом",
        text: `Запись № ${b.id} отменена${b.data.cancelReason ? ` — ${b.data.cancelReason}` : ""}`,
        at: b.updated_at, canConfirm: false,
      });
      continue;
    }
    if (b.prepay_status === "released_to_shop" && b.prepay_amount > 0) {
      out.push({
        id: `prepay-${b.id}`, bookingId: b.id, icon: "check", accent: false,
        title: "Предоплата зачислена",
        text: `${b.prepay_amount.toLocaleString("ru-RU")} ₽ по записи № ${b.id} переведены на кошелёк сервиса`,
        at: b.updated_at, canConfirm: false,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Группировка ленты на «Сегодня» и «Ранее». */
export function groupFeed(feed: readonly Notification[], today: string, localDay: (at: Date) => string) {
  const now = feed.filter(n => localDay(new Date(n.at)) === today);
  const earlier = feed.filter(n => localDay(new Date(n.at)) !== today);
  return [
    { title: "Сегодня", items: now },
    { title: "Ранее", items: earlier },
  ].filter(g => g.items.length > 0);
}
