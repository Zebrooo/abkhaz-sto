// Cookie-мост для WebView мобильной оболочки (флейвор «СТО» в
// djonua/abkhaz-auto-mobile, #1276) — копия маршрута сайта
// (abkhaz-auto, src/app/api/auth/mobile-bridge/route.ts) без промо-хвостов.
//
// Нативная часть входит по телефону и держит access/refresh токены; WebView —
// отдельный браузерный контекст, он аутентифицируется кукой aa-auth-token.
// Шелл делает same-origin fetch сюда с токенами (относительно текущей
// страницы, а страницы у приложения СТО — на своём хосте, поэтому маршрут
// нужен здесь, а не только на сайте); ssr.setSession кладёт куку на ответ с
// ТЕМ ЖЕ именем и доменом, что у сайта (src/lib/auth-cookies.ts) — её видит и
// сайт, и приложение. Токены — в теле POST, не в URL.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/auth-cookies";

export const dynamic = "force-dynamic";

type Body = { access_token?: unknown; refresh_token?: unknown };

/** GoTrue не ответил или ответил «повтори»: 429, 5xx, обрыв (status 0), сетевой сбой библиотеки. */
function isTransient(error: { name?: string; status?: number; code?: string }): boolean {
  const s = error.status;
  return (
    error.name === "AuthRetryableFetchError" ||
    s === 0 || s === 429 || (typeof s === "number" && s >= 500) ||
    // Токен уже прокрутил ДРУГОЙ держатель (натив и кука сайта делят refresh-токен):
    // сессия жива, у натива через секунды свежий — повторить мост, а не выходить.
    error.code === "refresh_token_already_used"
  );
}

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!accessToken || !refreshToken) return NextResponse.json({ ok: false, error: "Нет токенов сессии" }, { status: 400 });

  const cookieStore = await cookies();
  // ⚠️ ВНУТРЕННИЙ АДРЕС, А НЕ ПУБЛИЧНЫЙ. setSession — серверный вызов к GoTrue,
  // и по NEXT_PUBLIC_SUPABASE_URL он уходил из контейнера в интернет, на
  // Traefik и обратно (hairpin). Каждый такой круг — лишние сотни миллисекунд
  // и лишний способ отказать: 16.09.2026 в проде поймано «fetch failed»
  // со status 0, то есть обрыв на этом самом круге. Маршрут отвечает на него
  // 503, оболочка повторяет, а человек в это время висит гостем. По
  // supabase-aa-kong внутри сети — 4 мс и никакого интернета.
  //
  // Имя куки от адреса не зависит (authCookieOptions задаёт его явно), поэтому
  // подмена базы на сессию не влияет.
  // || , а не ?? : пустая строка в переменной окружения — это «не задано», и
  // через ?? она прошла бы как адрес, оставив клиент без базы.
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ssr = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Маршрут никогда не удаляет сессию неявно: пачку из одних пустых
        // значений («удалить сессию» из auth-js) пропускаем — как на сайте.
        if (toSet.every(c => c.value === "")) return;
        for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
      },
    },
  });

  const { data, error } = await ssr.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) {
    const e = error as { name?: string; status?: number; code?: string; message: string };
    const transient = isTransient(e);
    console.error(`[auth/mobile-bridge] setSession failed (transient=${transient}, code=${e.code ?? "-"}, status=${e.status ?? "-"}):`, e.message);
    // 401 шелл считает «сессия правда недействительна» и делает жёсткий выход —
    // это платный повторный вход, поэтому всё транзиентное — 503 и ретрай.
    const headers = e.status === 429 ? { "Retry-After": "30" } : undefined;
    return transient
      ? NextResponse.json({ ok: false, error: "Сервер недоступен" }, { status: 503, headers })
      : NextResponse.json({ ok: false, error: "Сессия недействительна" }, { status: 401 });
  }
  if (!data.user?.id) return NextResponse.json({ ok: false, error: "Сервер недоступен" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
