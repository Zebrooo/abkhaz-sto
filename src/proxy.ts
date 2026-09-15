import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/auth-cookies";

/** Без входа: объяснение, как войти, здоровье и cookie-мост мобильной оболочки (он сессию и создаёт). */
const PUBLIC_PATHS = ["/vhod", "/api/health", "/api/auth/mobile-bridge"];

// Файл proxy.ts — в Next 16 так зовётся прежний middleware.
// Стандартный приём @supabase/ssr: обновить сессию по куке и переложить
// свежие куки в ответ; без входа — на /vhod. Куку ставит сайт (общий домен),
// здесь она только читается и продлевается.
export async function proxy(req: NextRequest) {
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
    const to = req.nextUrl.clone();
    to.pathname = "/vhod";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
