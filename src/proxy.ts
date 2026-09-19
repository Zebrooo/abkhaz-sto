import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/auth-cookies";

/**
 * Без входа: объяснение, как войти, здоровье, cookie-мост мобильной оболочки
 * (он сессию и создаёт) и файлы-ассоциации приложения.
 *
 * ⚠️ /.well-known ОБЯЗАН быть публичным. Apple и Google ходят за файлом
 * ассоциации без куки; замок сессии отдал бы им страницу входа вместо json, и
 * ссылки на этот домен перестали бы открываться в приложении. Обе формы пути:
 * наружную видит робот, внутреннюю — rewrite из next.config.ts.
 */
const PUBLIC_PATHS = [
  "/vhod", "/api/health", "/api/auth/mobile-bridge",
  "/.well-known", "/well-known",
];

// Файл proxy.ts — в Next 16 так зовётся прежний middleware.
// Стандартный приём @supabase/ssr: обновить сессию по куке и переложить
// свежие куки в ответ; без входа — содержимое /vhod на том же адресе. Куку ставит сайт (общий домен),
// здесь она только читается и продлевается.
export async function proxy(req: NextRequest) {
  // Не-GET запросы — это server actions форм, и getUser() здесь был бы лишним
  // HTTP к GoTrue на каждое действие: сессию в действии проверяет само
  // действие (ctx()/getServerUser), а кука обновляется на навигациях (GET).
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + "/"))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // ⚠️ ПОКАЗЫВАЕМ ВХОД НА ТОМ ЖЕ АДРЕСЕ, А НЕ УВОДИМ РЕДИРЕКТОМ.
    //
    // Мобильная оболочка перехватывает ЛЮБОЙ переход, путь которого начинается
    // с /vhod, и отменяет его, чтобы показать свой нативный вход вместо
    // веб-страницы (webview_shell.dart, onNavigationRequest). У приложения
    // автосервиса все вкладки — защищённые пути, гостевой страницы нет вовсе.
    // Получался тупик: вкладка грузит /segodnya → мы отвечаем редиректом на
    // /vhod → оболочка переход отменяет → документ так и не открывается, экран
    // остаётся белым навсегда, потому что «загрузка закончилась» не наступает.
    // Владелец поймал это 16.09.2026: белый экран и вечная полоса прогресса.
    //
    // rewrite отдаёт содержимое /vhod прямо по запрошенному адресу: перехода
    // на /vhod нет, отменять нечего, документ открывается, оболочка досылает
    // сессию мостом и перезагружает вкладку уже на своё место.
    const to = req.nextUrl.clone();
    to.pathname = "/vhod";
    to.search = "";
    return NextResponse.rewrite(to);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
