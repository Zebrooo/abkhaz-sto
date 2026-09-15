import "server-only";
// Осмотр машины и найденные дефекты.
//
// ГЛАВНОЕ ПРАВИЛО ЭКРАНА, из которого следует вся эта модель: мастер не
// отмечает норму. В осмотре есть только найденное; всё, чего он не коснулся,
// уходит в отчёт как «проверено и в норме». Поэтому здесь нет чек-листа
// узлов и нет состояния «ок» — есть список дефектов, а норма считается
// вычитанием (см. okNodes в reports.ts).
//
// ЦЕНЫ МАСТЕР НЕ НАЗНАЧАЕТ. Каждая формулировка привязана к строке прайса
// витрины: выбрал «Колодки стёрты до 2 мм» — вместе с ней приехали работа,
// её длительность и цена. Работы нет в прайсе — цена null, в смете это
// «договорная», и согласование уходит админу. Так сервис не расходится сам с
// собой, а мастер не торгуется у машины.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";

/** Критично и внимание. Третьего нет: норма — это отсутствие дефекта. */
export const SEVERITIES = ["bad", "warn"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = { bad: "критично", warn: "внимание" };

export function isSeverity(v: unknown): v is Severity {
  return v === "bad" || v === "warn";
}

export type DefectPhoto = {
  id: string;
  /** Готовый адрес картинки; сайт отдаёт подписанный, живёт не меньше часа. */
  url: string;
  width: number | null;
  height: number | null;
};

export type Defect = {
  id: number;
  nodeKey: string;
  title: string;
  severity: Severity;
  /** Что с этим делать — строка прайса витрины. */
  work: string;
  /** null — «договорная», цену согласует админ. */
  price: number | null;
  durationMin: number;
  /** Свободная приписка мастера поверх готовой формулировки. */
  note: string | null;
  photos: DefectPhoto[];
  createdAt: string;
};

export type Inspection = {
  id: number;
  bookingId: number;
  /** Кто смотрит машину; null — осмотр начал админ. */
  masterId: number | null;
  masterName: string | null;
  /**
   * Пробег на момент осмотра, км. Спрашивается в начале КАЖДОГО осмотра, а не
   * тянется из прошлого отчёта: между визитами машина ездит, и подставленный
   * пробег сделал бы отчёт неправдивым — а его читает клиент и по нему
   * назначают следующее ТО.
   */
  odometerKm: number;
  /** draft — мастер ещё ходит вокруг машины; finished — собрал отчёт. */
  status: "draft" | "finished";
  defects: Defect[];
  createdAt: string;
  finishedAt: string | null;
};

/**
 * Готовая формулировка узла. «прайс» — заводской каталог, «ваша
 * формулировка» — то, что сервис однажды написал своими словами и что
 * сохранилось в каталог. uses — сколько раз её добавляли за 90 дней; по
 * этому счётчику собирается строка «вы добавляете чаще всего».
 */
export type DefectPreset = {
  id: number;
  nodeKey: string;
  title: string;
  severity: Severity;
  work: string;
  price: number | null;
  durationMin: number;
  own: boolean;
  uses: number;
};

/**
 * Осмотр записи. not_found — осмотра ещё нет, и это нормальное состояние:
 * экран покажет «Снять дефект» на пустом месте.
 *
 * GET /api/sto/inspections?shopId&actorUserId&bookingId → Inspection
 */
export function fetchInspection(input: {
  shopId: number; actorUserId: string; bookingId: number;
}): Promise<ApiResult<Inspection>> {
  return siteGet<Inspection>("inspections", input);
}

/**
 * Свод по нескольким записям — для счётчиков в карточке записи и в списке
 * отчётов за смену, без вытаскивания всех дефектов.
 *
 * GET /api/sto/inspections/summary?shopId&actorUserId&from&to
 */
export type InspectionSummary = {
  bookingId: number;
  inspectionId: number;
  status: Inspection["status"];
  badCount: number;
  warnCount: number;
  /** Сумма включённых в смету пунктов. */
  total: number;
};

export function fetchInspectionSummaries(input: {
  shopId: number; actorUserId: string; from: string; to: string;
}): Promise<ApiResult<InspectionSummary[]>> {
  return siteGet<InspectionSummary[]>("inspections/summary", input);
}

/**
 * Начать осмотр. Пробег обязателен — это первое, что спрашивает экран, и
 * без него осмотра не бывает. Сайт сверяет его с прошлым по этой машине:
 * пробег, уехавший назад, — опечатка, и принимать её молча нельзя.
 *
 * Повторный вызов отдаёт уже начатый осмотр (пробег при этом не
 * перезаписывается): мастер жмёт «Осмотр» из карточки записи столько раз,
 * сколько нужно, и второго осмотра не появляется.
 *
 * POST /api/sto/inspections/start { shopId, actorUserId, bookingId, odometerKm, masterId? }
 */
export function startInspection(input: {
  shopId: number; actorUserId: string; bookingId: number; odometerKm: number; masterId?: number | null;
}): Promise<ApiResult<Inspection>> {
  return sitePost<Inspection>("inspections/start", input);
}

/**
 * Добавить дефект. Либо по готовой формулировке (presetId — работа и цена
 * приезжают из прайса), либо своими словами (тогда title, severity и work
 * обязательны, а сайт сохраняет формулировку в каталог узла, чтобы в
 * следующий раз она была готовым пунктом и начала копить счётчик).
 *
 * POST /api/sto/inspections/defects
 */
export function addDefect(input: {
  shopId: number; actorUserId: string; inspectionId: number;
  nodeKey: string;
  presetId?: number;
  title?: string;
  severity?: Severity;
  /** Своя формулировка: строка прайса или «цену согласует админ» (listingId пуст). */
  work?: string;
  listingId?: number | null;
  note?: string;
  /** Фото, уже загруженные в хранилище (см. createPhotoUpload). */
  photoIds?: string[];
}): Promise<ApiResult<Defect>> {
  return sitePost<Defect>("inspections/defects", input);
}

/**
 * POST /api/sto/inspections/defects/update { …, defectId, severity?, note?, photoIds? }
 *
 * photoIds — ПОЛНЫЙ список фото дефекта, а не добавка: приложение читает
 * текущие, дописывает новый id и шлёт все. Так убрать кадр — тот же вызов
 * без него, и второго маршрута не нужно.
 */
export function updateDefect(input: {
  shopId: number; actorUserId: string; defectId: number;
  severity?: Severity; note?: string | null; photoIds?: string[];
}): Promise<ApiResult<Defect>> {
  return sitePost<Defect>("inspections/defects/update", input);
}

/** POST /api/sto/inspections/defects/remove { shopId, actorUserId, defectId } */
export function removeDefect(input: {
  shopId: number; actorUserId: string; defectId: number;
}): Promise<ApiResult<{ removed: true }>> {
  return sitePost<{ removed: true }>("inspections/defects/remove", input);
}

/**
 * Каталог формулировок. Без nodeKey — весь каталог сервиса, с ним — один
 * узел (шторка после выбора плитки).
 *
 * GET /api/sto/inspections/presets?shopId&actorUserId&nodeKey? → DefectPreset[]
 */
export function fetchPresets(input: {
  shopId: number; actorUserId: string; nodeKey?: string;
}): Promise<ApiResult<DefectPreset[]>> {
  return siteGet<DefectPreset[]>("inspections/presets", input);
}

/**
 * «Вы добавляете чаще всего» — шесть формулировок с наибольшим счётчиком за
 * 90 дней. Считает сайт, а не приложение: у нового сервиса своей статистики
 * нет, и он отдаёт стартовый набор по типу работ, а экрану эта разница
 * не видна.
 *
 * GET /api/sto/inspections/presets/frequent?shopId&actorUserId&limit
 */
export function fetchFrequentPresets(input: {
  shopId: number; actorUserId: string; limit?: number;
}): Promise<ApiResult<DefectPreset[]>> {
  return siteGet<DefectPreset[]>("inspections/presets/frequent", input);
}

/**
 * Куда положить фото дефекта. Файл идёт в хранилище напрямую из браузера по
 * одноразовому адресу, а не через сервер приложения: мастер снимает
 * несколько кадров подряд с телефона в яме, и лишний перегон мегабайтов
 * через наш контейнер — это только задержка и память.
 *
 * POST /api/sto/inspections/photo-upload { shopId, actorUserId, contentType }
 *   → { photoId, uploadUrl, expiresAt }
 */
export type PhotoUpload = { photoId: string; uploadUrl: string; expiresAt: string };

export function createPhotoUpload(input: {
  shopId: number; actorUserId: string; contentType: string;
}): Promise<ApiResult<PhotoUpload>> {
  return sitePost<PhotoUpload>("inspections/photo-upload", input);
}
