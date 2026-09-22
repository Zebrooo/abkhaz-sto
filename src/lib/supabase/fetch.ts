// Fetch с потолком ожидания — для всех клиентов Supabase приложения
// (server.ts и proxy.ts; proxy не может импортировать server.ts — тот держит
// "server-only", которого нет в бандле middleware). У fetch в Node таймаута
// по умолчанию нет, и зависший Kong/GoTrue держал рендер вечно: экран не
// рисовался и не падал. 5 секунд — на порядки больше нормального ответа по
// внутренней docker-сети и меньше терпения человека за стойкой.
//
// Ошибка таймаута идёт по СУЩЕСТВУЮЩИМ error-веткам, ничего нового ловить не
// надо: postgrest-js перехватывает отказ fetch и отдаёт { error } в
// результате (лог + пустой список, как listBookings), а auth-js возвращает
// AuthRetryableFetchError из getUser — user становится null, и человек
// упирается в обычный гейт входа, а не в вечную загрузку.
const SUPABASE_TIMEOUT_MS = 5_000;

export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  // Переданный signal уважаем: отмена запроса самим клиентом (например, при
  // оборванном рендере) должна обрывать HTTP, а не ждать наш таймаут.
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
