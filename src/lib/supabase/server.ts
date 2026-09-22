import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { authCookieOptions } from "@/lib/auth-cookies";
import { fetchWithTimeout } from "@/lib/supabase/fetch";

/** Клиент под сессией человека (кука сайта). Для Server Components и Actions. */
export async function createSupabaseServer() {
  // Внутренний адрес, как у сервисного клиента ниже: getUser() на каждый
  // рендер ходил петлёй контейнер → Traefik → Kong, хотя GoTrue стоит в той
  // же docker-сети. Имя куки от адреса не зависит (auth-cookies.ts). Без
  // переменной (локальная разработка) — публичный адрес, как раньше.
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const c = await cookies();
  return createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions,
    // Потолок ожидания: зависший GoTrue не должен держать рендер вечно.
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll: () => c.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => c.set(name, value, options));
        } catch {
          // Из Server Component куки не пишутся — их обновляет middleware.
        }
      },
    },
  });
}

/** Один поход в GoTrue на запрос, сколько бы компонентов ни спросили пользователя. */
export const getServerUser = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Сервисный клиент — только на сервере. Записи и витрины закрыты от
 * anon/authenticated (20260915063709), поэтому приложение читает их под
 * сервисным ключом ПОСЛЕ проверки владения (src/lib/shop.ts). Ключ живёт в
 * окружении контейнера и в браузер не уходит.
 */
export function createSupabaseAdmin() {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServerClient(url, serviceKey, {
    // Потолок ожидания (fetch.ts): зависшая база — пустой экран с логом,
    // а не рендер, который не кончается никогда.
    global: { fetch: fetchWithTimeout },
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
