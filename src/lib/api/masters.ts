import "server-only";
// Мастера и их посты. В первом релизе записи знали только номер поста
// (`sto_bookings.post_no`) — кто именно делает работу, нигде не хранилось.
// Дизайн ставит мастера в середину: у него свой экран смены, к нему
// привязана запись, по нему считается выручка. Справочник и привязки ведёт
// сайт; приложение их показывает и переключает.
//
// Мастер и сотрудник — разные вещи. Мастер может не иметь учётки (пожилой
// моторист без телефона — обычное дело), тогда userId пуст: он есть в
// расписании и в отчётах, но в приложение не входит. Сотрудник с учёткой,
// наоборот, может быть админом и на посту не стоять.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";

export type StoMaster = {
  id: number;
  name: string;
  /** «Двигатель, диагностика» — что он делает, подпись под именем. */
  speciality: string;
  /** Учётка, если мастер ещё и входит в приложение. */
  userId: string | null;
  /** Пост, за которым он закреплён; null — плавающий мастер. */
  postNo: number | null;
  /** На смене сегодня. Выключенный мастер не занимает окна своего поста. */
  onShift: boolean;
  active: boolean;
};

/** Сколько мастер наработал за период — для «Мастеров» и сводки хозяина. */
export type MasterLoad = {
  masterId: number;
  /** Занятых окон и всего окон на его посту. */
  busySlots: number;
  totalSlots: number;
  /** Выполненные работы и деньги по ним. */
  jobs: number;
  revenue: number;
};

/** GET /api/sto/masters?shopId&actorUserId → StoMaster[] */
export function fetchMasters(shopId: number, actorUserId: string): Promise<ApiResult<StoMaster[]>> {
  return siteGet<StoMaster[]>("masters", { shopId, actorUserId });
}

/**
 * Загрузка мастеров за период. Период — те же границы, что у сводки денег,
 * чтобы цифры на двух экранах сходились до рубля.
 *
 * GET /api/sto/masters/load?shopId&actorUserId&from&to → MasterLoad[]
 */
export function fetchMastersLoad(input: {
  shopId: number; actorUserId: string; from: string; to: string;
}): Promise<ApiResult<MasterLoad[]>> {
  return siteGet<MasterLoad[]>("masters/load", input);
}

/** POST /api/sto/masters { shopId, actorUserId, name, speciality, postNo, userId? } */
export function createMaster(input: {
  shopId: number; actorUserId: string; name: string; speciality: string; postNo: number | null; userId?: string | null;
}): Promise<ApiResult<StoMaster>> {
  return sitePost<StoMaster>("masters", input);
}

/**
 * Правка мастера: имя, специальность, пост, смена, увольнение. Патч
 * частичный — экран шлёт только то, что человек тронул.
 *
 * ВЫКЛЮЧЕНИЕ МАСТЕРА НЕ ТРОГАЕТ ЕГО ЗАПИСИ. Мастер — человек на записи, а
 * место держит пост: это он записан в sto_bookings, и это его защищает
 * ограничение базы от двойной записи. Сняли мастера со смены — записи
 * остались на своих постах и ждут нового исполнителя; убрать вместе с ним
 * занятые окна значило бы молча потерять пришедших клиентов.
 *
 * Поэтому ответ несёт orphaned — записи, оставшиеся без мастера. Экран
 * показывает их сразу после переключателя: «передайте эти работы».
 *
 * POST /api/sto/masters/update { shopId, actorUserId, masterId, ...patch }
 */
export type MasterUpdate = { master: StoMaster; orphaned: BookingMaster["bookingId"][] };

export function updateMaster(input: {
  shopId: number; actorUserId: string; masterId: number;
  name?: string; speciality?: string; postNo?: number | null; onShift?: boolean; active?: boolean;
}): Promise<ApiResult<MasterUpdate>> {
  return sitePost<MasterUpdate>("masters/update", input);
}

/**
 * Кто делает записи дня. Отдельным вызовом, а не полем в записи: запись
 * живёт в схеме сайта, и приложение её колонки не трогает (AGENTS.md).
 * Ответ — только пары, экран сам раскладывает их по записям.
 *
 * GET /api/sto/masters/bookings?shopId&actorUserId&from&to → { bookingId, masterId }[]
 */
export type BookingMaster = { bookingId: number; masterId: number };

export function fetchBookingMasters(input: {
  shopId: number; actorUserId: string; from: string; to: string;
}): Promise<ApiResult<BookingMaster[]>> {
  return siteGet<BookingMaster[]>("masters/bookings", input);
}

/**
 * Назначить мастера на запись. masterId = null снимает назначение: запись
 * снова «на посту», без имени.
 *
 * POST /api/sto/masters/assign { shopId, actorUserId, bookingId, masterId }
 */
export function assignBookingMaster(input: {
  shopId: number; actorUserId: string; bookingId: number; masterId: number | null;
}): Promise<ApiResult<BookingMaster | null>> {
  return sitePost<BookingMaster | null>("masters/assign", input);
}
