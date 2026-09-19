import "server-only";
// Запросы к сайту: один подписанный вызов для всех сущностей приложения.
//
// ЗАЧЕМ. Схемы БД у приложения нет и не будет (AGENTS.md): записи и витрины
// оно читает из общей базы под сервисным ключом, а всё, чего в этой схеме
// нет — мастера, доступы, осмотр, отчёты, заметки о клиентах, деньги, чат —
// живёт на стороне abkhaz-auto и приезжает сюда по HTTP. Приложение не
// заводит своих таблиц: оно спрашивает сайт.
//
// AUTH — тот же механизм, что у promo-bff и у нынешнего booking-event:
// Ed25519 service-ticket в заголовке x-service-ticket, приложение подписывает
// приватным ключом (STO_TICKET_PRIVATE_KEY, src = abkhaz-sto, dst =
// abkhaz-auto), сайт проверяет публичным. Ticket подтверждает, что запрос
// пришёл из приложения, а не КТО его сделал: чей это сервис и кто его
// сотрудник, сайт проверяет по shopId и actorUserId в самом запросе — ровно
// как booking-event сверяет владение через shop-owner.ts. Поэтому actorUserId
// в каждом вызове обязателен, и подставляет его вызывающий код из сессии, а
// не из тела формы.
//
// ОТЛИЧИЕ ОТ site-events.ts. Там события «постфактум»: переход в базе уже
// сделан, ответ сайта ни на что не влияет, и недоступность сайта — не
// ошибка. Здесь наоборот: это единственный источник данных, и «не ответил»
// обязано дойти до экрана, а не превратиться в пустой список. Поэтому тут
// результат-объединение, а не void.
import { issueServiceTicket, SERVICE_TICKET_HEADER } from "@zebrooo/service-ticket";

/** Коды ошибок сайта — те же строки, что отдаёт apiError (src/lib/api/errors.ts). */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "conflict"
  | "internal"
  /** Сайт не ответил за отведённое время или сеть легла — своя, не серверная. */
  | "unavailable"
  /** Адрес или ключ подписи не заданы в окружении контейнера. */
  | "not_configured";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ApiErrorCode; error: string };

/**
 * Читающие вызовы ждут недолго: экран за стойкой должен нарисоваться, даже
 * если сайт задумался. Пишущие — дольше: там на той стороне транзакция и
 * побочные эффекты, и оборвать её на полпути хуже, чем подождать.
 */
const READ_TIMEOUT_MS = 3_000;
const WRITE_TIMEOUT_MS = 8_000;
/** Пауза перед единственной повторной попыткой чтения. */
const RETRY_DELAY_MS = 300;

/** Человеческие подписи кодов — их видно на экране, когда запрос не удался. */
const MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: "Сайт не принял подпись приложения",
  forbidden: "Нет доступа к этому сервису",
  not_found: "Не найдено",
  validation_error: "Сайт не принял данные",
  rate_limited: "Слишком много запросов — попробуйте через минуту",
  conflict: "Данные успели измениться — обновите экран",
  internal: "На сайте что-то сломалось",
  unavailable: "Сайт сейчас недоступен",
  not_configured: "Связь с сайтом не настроена",
};

/** Адрес сайта для служебных вызовов: внутренний в docker-сети, иначе публичный. */
export function siteApiBase(): string | null {
  const raw = process.env.SITE_INTERNAL_URL || process.env.NEXT_PUBLIC_SITE_URL;
  return raw ? raw.replace(/\/$/, "") : null;
}

const baseUrl = siteApiBase;

/**
 * Свежий тикет подписи. Одно место на всё приложение: разъедутся src и dst —
 * сайт перестанет принимать и данные, и события, а искать это придётся в
 * двух файлах. null — ключа в окружении нет.
 */
export function issueTicket(): string | null {
  const privateKey = process.env.STO_TICKET_PRIVATE_KEY;
  if (!privateKey) return null;
  return issueServiceTicket({
    src: process.env.STO_TICKET_SRC ?? "abkhaz-sto",
    dst: process.env.STO_TICKET_DST ?? "abkhaz-auto",
    privateKey,
  });
}

/** Ответ сайта: { data } при удаче, { error: { code, message } } при отказе. */
type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

function isErrorCode(v: unknown): v is ApiErrorCode {
  return typeof v === "string" && v in MESSAGE;
}

function fail(code: ApiErrorCode, message?: string): { ok: false; code: ApiErrorCode; error: string } {
  return { ok: false, code, error: message?.trim() || MESSAGE[code] };
}

/**
 * Одна попытка запроса. Таймаут — на попытку, а не на запрос целиком:
 * у повторной попытки свой AbortController. last — «попытка последняя»:
 * warn о недоступности пишем только после неё, иначе один сбой с retry
 * давал бы два warn в логе.
 */
async function attempt<T>(
  method: string,
  url: URL,
  headers: Record<string, string>,
  path: string,
  init: { body?: unknown; timeoutMs?: number },
  last: boolean,
): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? READ_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      // Данные сервиса меняются на каждом действии — кэшировать их нельзя.
      cache: "no-store",
    });

    let payload: Envelope<T> | null = null;
    try {
      payload = (await res.json()) as Envelope<T>;
    } catch {
      // Тела нет или это не JSON — разберём по одному статусу ниже.
    }

    if (!res.ok) {
      const code = isErrorCode(payload?.error?.code) ? payload.error.code : statusToCode(res.status);
      if (code !== "not_found") {
        console.warn("[сто] сайт отказал:", method, path, res.status, payload?.error?.message ?? "");
      }
      return fail(code, payload?.error?.message);
    }
    if (!payload || payload.data === undefined) {
      console.warn("[сто] сайт ответил без данных:", method, path);
      return fail("internal");
    }
    return { ok: true, data: payload.data };
  } catch (e) {
    // AbortError от таймаута и сетевой сбой для экрана — одно и то же.
    if (last) console.warn("[сто] сайт недоступен:", method, path, e);
    return fail("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Один запрос к /api/sto/*. Ошибку не бросает: любой исход — объединение,
 * которое экран разбирает наравне с данными. Логируем всё, кроме not_found:
 * «ещё не заводили» — обычное состояние нового сервиса, а не происшествие.
 *
 * GET идемпотентен, поэтому единичный сетевой сбой повторяем один раз с
 * короткой паузой — иначе каждый случайный обрыв становился бы ошибкой на
 * экране. Пишущие методы не повторяем: на той стороне транзакция с побочными
 * эффектами, и вторая попытка могла бы задвоить её.
 */
async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  init: { query?: Record<string, string | number | undefined>; body?: unknown; timeoutMs?: number },
): Promise<ApiResult<T>> {
  const base = baseUrl();
  const signed = issueTicket();
  if (!base || !signed) {
    console.error("[сто] запрос к сайту не отправлен: не задан адрес или ключ подписи", method, path);
    return fail("not_configured");
  }

  const url = new URL(`${base}/api/sto/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { accept: "application/json" };
  headers[SERVICE_TICKET_HEADER] = signed;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  const attempts = method === "GET" ? 2 : 1;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    const res = await attempt<T>(method, url, headers, path, init, i === attempts - 1);
    // Повторяем только сетевой сбой/таймаут; отказ сайта — это ответ.
    if (res.ok || res.code !== "unavailable") return res;
  }
  return fail("unavailable");
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400) return "validation_error";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  return "internal";
}

export function siteGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<ApiResult<T>> {
  return request<T>("GET", path, { query });
}

export function sitePost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>("POST", path, { body, timeoutMs: WRITE_TIMEOUT_MS });
}

export function sitePatch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>("PATCH", path, { body, timeoutMs: WRITE_TIMEOUT_MS });
}

/**
 * Список, которым можно рисовать экран прямо сейчас. Отказ сайта — пустой
 * список: раздел покажет своё пустое состояние, а не упадёт. Применять
 * только там, где пустота честна и не выглядит как «ничего не найдено» —
 * там, где разница важна, экран разбирает ApiResult сам.
 */
export function listOr<T>(result: ApiResult<T[]>, fallback: T[] = []): T[] {
  return result.ok ? result.data : fallback;
}
