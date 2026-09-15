import "server-only";
// Отчёт по диагностике — то, что сервис отдаёт клиенту: дефекты с фото,
// список проверенного и смета. Это не отдельная сущность рядом с осмотром, а
// его лицо: один осмотр — один отчёт, номер общий с записью (Д-812).
//
// СМЕТА СЧИТАЕТСЯ НА САЙТЕ, а не здесь. Соблазн сложить цены дефектов в
// приложении велик, но сумма из отчёта уходит клиенту и в деньги сервиса, и
// две реализации одного сложения рано или поздно разойдутся на копейку —
// считает тот, кто хранит.
//
// ПУТЬ ОТЧЁТА. draft — мастер ещё собирает; with_admin — передал
// администратору (у мастера прав отправлять клиенту нет); with_client —
// админ отправил, клиент видит его у себя и одобряет работы по пунктам.
// Поэтому главная кнопка внизу экрана у мастера и у админа разная.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";
import type { Defect } from "@/lib/api/inspections";

export const REPORT_STATUSES = ["draft", "with_admin", "with_client"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "черновик",
  with_admin: "у админа",
  with_client: "у клиента",
};

/** Строка сметы: дефект, который сервис предлагает починить. */
export type EstimateItem = {
  defectId: number;
  work: string;
  /** null — договорная: работы нет в прайсе, цену согласует админ. */
  price: number | null;
  durationMin: number;
  /** Пункт выключили галочкой — в сумму не идёт и клиенту не предлагается. */
  included: boolean;
  /** Клиент уже ответил по этому пункту (отчёт у клиента). */
  approved: boolean | null;
};

export type Report = {
  inspectionId: number;
  bookingId: number;
  /** «Д-812» — номер для людей. */
  no: string;
  status: ReportStatus;
  car: string;
  plate: string | null;
  odometerKm: number | null;
  masterName: string | null;
  inspectedAt: string;
  defects: Defect[];
  /** Узлы, до которых мастер не дотронулся, — «проверено и в норме». */
  okNodeKeys: string[];
  estimate: EstimateItem[];
  /** Сумма и время включённых пунктов — считает сайт. */
  total: number;
  /** Есть пункты с договорной ценой: в подписи суммы нужна оговорка. */
  hasNegotiable: boolean;
  totalMin: number;
  sentToAdminAt: string | null;
  sentToClientAt: string | null;
};

/** GET /api/sto/reports?shopId&actorUserId&inspectionId → Report */
export function fetchReport(input: {
  shopId: number; actorUserId: string; inspectionId: number;
}): Promise<ApiResult<Report>> {
  return siteGet<Report>("reports", input);
}

/**
 * Отчёты за период — список «Отчёты за смену» у мастера и лента у админа.
 *
 * GET /api/sto/reports/list?shopId&actorUserId&from&to&masterId? → ReportBrief[]
 */
export type ReportBrief = {
  inspectionId: number;
  bookingId: number;
  no: string;
  status: ReportStatus;
  car: string;
  total: number;
  masterName: string | null;
  inspectedAt: string;
};

export function fetchReports(input: {
  shopId: number; actorUserId: string; from: string; to: string; masterId?: number;
}): Promise<ApiResult<ReportBrief[]>> {
  return siteGet<ReportBrief[]>("reports/list", input);
}

/**
 * Включить или выключить пункт сметы. Возвращается весь отчёт, а не одна
 * строка: сумма и время пересчитаны, и экран рисует их из ответа, а не
 * складывает сам.
 *
 * POST /api/sto/reports/item { shopId, actorUserId, inspectionId, defectId, included }
 */
export function setEstimateItem(input: {
  shopId: number; actorUserId: string; inspectionId: number; defectId: number; included: boolean;
}): Promise<ApiResult<Report>> {
  return sitePost<Report>("reports/item", input);
}

/**
 * Передать отчёт дальше: мастер — администратору, администратор — клиенту.
 * Кому именно, решает сайт по роли actorUserId: у мастера нет права
 * отправлять клиенту, и проверять это в браузере бессмысленно.
 *
 * POST /api/sto/reports/send { shopId, actorUserId, inspectionId }
 */
export function sendReport(input: {
  shopId: number; actorUserId: string; inspectionId: number;
}): Promise<ApiResult<Report>> {
  return sitePost<Report>("reports/send", input);
}

/**
 * Адрес PDF. Файл собирает сайт — там шрифты, логотип площадки и реквизиты
 * витрины; приложение только открывает ссылку.
 *
 * GET /api/sto/reports/pdf?shopId&actorUserId&inspectionId → { url, expiresAt }
 */
export function fetchReportPdf(input: {
  shopId: number; actorUserId: string; inspectionId: number;
}): Promise<ApiResult<{ url: string; expiresAt: string }>> {
  return siteGet<{ url: string; expiresAt: string }>("reports/pdf", input);
}
