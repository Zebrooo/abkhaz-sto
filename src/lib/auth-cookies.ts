// Кука сессии — ТА ЖЕ, что у сайта (abkhaz-auto, src/lib/auth-cookies.ts):
// имя aa-auth-token и домен .abkhaz-auto.ru. Вход делается на сайте, а
// приложение на поддомене просто читает общую куку. Разъедутся имя или домен
// — приложение будет видеть гостя при живой сессии сайта.
//
// Имя задано ЯВНО и от адреса GoTrue не зависит: по умолчанию @supabase/ssr
// выводит имя куки из ref проекта в URL, и клиенты, ходящие по внутреннему
// SUPABASE_INTERNAL_URL (supabase/server.ts, proxy.ts), читали бы другую
// куку, чем сайт. С явным именем внутренний и публичный адреса дают одну и
// ту же сессию.
export const AUTH_COOKIE_NAME = "aa-auth-token";

/** Запекается в бандл на сборке (NEXT_PUBLIC_*) — прокинуть в Dockerfile и compose. */
export const AUTH_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export const authCookieAttributes = AUTH_COOKIE_DOMAIN
  ? ({ domain: AUTH_COOKIE_DOMAIN, secure: true } as const)
  : ({} as const);

export const authCookieOptions = { name: AUTH_COOKIE_NAME, ...authCookieAttributes } as const;
