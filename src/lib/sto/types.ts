// ⚠ КОПИЯ из abkhaz-auto (src/lib/sto/). Источник истины — там, вместе с
// миграциями; правки вносить в обоих репозиториях одним и тем же текстом.
// Запись на СТО — типы строки sto_bookings (20260915063709) и её снимков.
// Общая точка для сайта и внутреннего API приложения СТО (docs/API.md, «СТО»).
/** Валюта объявления сайта (src/lib/types.ts там же). */
export type Currency = "RUB" | "USD" | "EUR";

export const STO_BOOKING_STATUSES = ["new", "confirmed", "done", "cancelled", "no_show"] as const;
export type StoBookingStatus = (typeof STO_BOOKING_STATUSES)[number];

export const STO_BOOKING_STATUS_LABEL: Record<StoBookingStatus, string> = {
  new: "Ждёт подтверждения",
  confirmed: "Подтверждена",
  done: "Выполнена",
  cancelled: "Отменена",
  no_show: "Клиент не приехал",
};

export type StoCancelledBy = "client" | "shop" | "system";
export type StoBookingSource = "site" | "app";
export type StoPrepayStatus = "none" | "held" | "released_to_shop" | "refunded";

/** Снимок услуги на момент записи (sto_bookings.service). */
export type StoBookingService = {
  title: string;
  price: number | null;
  currency: Currency;
  durationMin: number;
  /** Ключ типового прайса (#980, #1271) — чтобы сравнивать записи разных сервисов. */
  catalogKey?: string | null;
};

/** Клиент ручной записи без учётки (sto_bookings.data.client). */
export type StoBookingClientSnapshot = { name: string; phone: string | null };

/** Машина снимком (sto_bookings.data.vehicle) — у ручной записи или на случай удаления из гаража. */
export type StoBookingVehicleSnapshot = {
  brand: string;
  model: string | null;
  year: number | null;
  plate: string | null;
};

export type StoBookingData = {
  client?: StoBookingClientSnapshot;
  vehicle?: StoBookingVehicleSnapshot;
  comment?: string;
  /** Причина отмены (сервисом или клиентом), свободный текст. */
  cancelReason?: string;
  /** До какого момента сервис должен ответить на новую запись (#1268). */
  confirmBy?: string;
  /** Переносы: кто, когда и с какого времени на какое. */
  history?: { at: string; from: string; to: string; by: "client" | "shop" }[];
};

/** Строка sto_bookings как её отдаёт база (snake_case, как в таблице). */
export type StoBookingRow = {
  id: number;
  shop_id: number;
  client_id: string | null;
  vehicle_id: number | null;
  listing_id: number | null;
  service: StoBookingService;
  starts_at: string;
  ends_at: string;
  post_no: number;
  status: StoBookingStatus;
  cancelled_by: StoCancelledBy | null;
  source: StoBookingSource;
  prepay_amount: number;
  prepay_status: StoPrepayStatus;
  data: StoBookingData;
  created_at: string;
  updated_at: string;
};

/** Длительность услуги по умолчанию, когда в объявлении её нет (attrs.duration_min). */
export const DEFAULT_STO_DURATION_MIN = 60;
export const MIN_STO_DURATION_MIN = 15;
export const MAX_STO_DURATION_MIN = 8 * 60;
