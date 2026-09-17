import "server-only";
// Гараж клиента на сайте: машины, которые человек завёл в своей учётке
// Абхаз Авто. Своей базы машин у приложения нет (AGENTS.md) — карточка
// машины собирается из снимков записей (lib/vehicles.ts), а гараж отвечает
// на другой вопрос: «чем человек ездит СЕЙЧАС».
//
// Зачем оба источника. Снимок в записи — это то, на чём приехали тогда:
// он не меняется задним числом, и по нему считается история ремонта. Гараж
// живой: машину продали — она из него ушла, купили — появилась. Поэтому в
// форме записи и в карточке клиента показываем гараж (актуальное), а
// историю ведём по снимкам (было как было).
//
// vehicle_id в записи — это id машины гаража (колонка уже есть в
// sto_bookings): записались с машиной из гаража — запись связана с ней, и
// сайт может показать её клиенту в кабинете.
import { normalizePhone } from "@/lib/phone";
import { siteGet, type ApiResult } from "@/lib/api/site-api";

export type StoGarageCar = {
  /** id машины в гараже сайта — он же ложится в sto_bookings.vehicle_id. */
  id: number;
  brand: string;
  model: string | null;
  year: number | null;
  plate: string | null;
  vin: string | null;
  /** Машина, на которой человек ездит сейчас: сайт помечает основную. */
  primary?: boolean;
};

/**
 * Гараж одного клиента. Спрашивать можно по учётке (клиент записался с
 * сайта) или по телефону (ручная запись за стойкой): у человека без учётки
 * гаража нет, и пустой список — обычный ответ, а не ошибка.
 *
 * GET /api/sto/garage?shopId&actorUserId&clientUserId|phone → StoGarageCar[]
 */
export function fetchGarage(input: {
  shopId: number;
  actorUserId: string;
  /** Учётка клиента, если запись пришла с сайта. */
  clientUserId?: string | null;
  /** Телефон клиента — по нему сайт находит учётку. */
  phone?: string | null;
}): Promise<ApiResult<StoGarageCar[]>> {
  const phone = normalizePhone(input.phone);
  // Спрашивать не о ком — не тревожим сайт и не пишем в лог отказ.
  if (!input.clientUserId && !phone) return Promise.resolve({ ok: true, data: [] });
  return siteGet<StoGarageCar[]>("garage", {
    shopId: input.shopId,
    actorUserId: input.actorUserId,
    clientUserId: input.clientUserId ?? undefined,
    phone: phone ?? undefined,
  });
}
