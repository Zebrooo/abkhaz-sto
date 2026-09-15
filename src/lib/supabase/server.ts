import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { authCookieOptions } from "@/lib/auth-cookies";

/** Клиент под сессией человека (кука сайта). Для Server Components и Actions. */
export async function createSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const c = await cookies();
  return createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions,
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
  return createServerClient(url, serviceKey, { cookies: { getAll: () => [], setAll: () => {} } });
}
