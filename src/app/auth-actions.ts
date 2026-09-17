"use server";
// Выход из приложения. Вход делается на сайте (кука общая для поддоменов,
// см. lib/auth-cookies.ts), а выход — ЗДЕСЬ: уходить человек должен из того
// приложения, в котором работает. В мобильной оболочке сайта под рукой нет
// вовсе, и без своей кнопки выйти было нечем — с этим и пришли.
//
// Шага два, и оба обязательны.
//
// 1. Погасить сессию в GoTrue. Это единственное, что достаёт до мобильной
//    оболочки: натив держит свои access/refresh токены и досылает их в
//    WebView мостом (api/auth/mobile-bridge), поэтому стёртой куки мало —
//    через секунды шелл принесёт токены снова, и человек опять внутри. По
//    погашенной сессии мост получит от GoTrue отказ и ответит 401, а на 401
//    шелл делает жёсткий выход и показывает свой вход.
//    scope: "local" — гасим ИМЕННО эту сессию, а не все: телефон сменщика и
//    компьютер за стойкой к этой кнопке отношения не имеют.
//
// 2. Стереть куку сессии — руками и С ДОМЕНОМ. Она выдана на
//    .abkhaz-auto.ru, и удаление без домена браузер применит к хосту
//    приложения: кука уцелеет, а человек вернётся вошедшим. Библиотека
//    чанкует длинную сессию (aa-auth-token.0, .1), поэтому чистим и их —
//    иначе останется огрызок сессии.
//
// Отказ GoTrue выход не отменяет: куку стираем и уводим на /vhod всё равно.
// Человек просил выйти — он выйдет; худшее, что останется, — живая сессия на
// сервере, которую добьёт следующий выход.
//
// Гейта примерки роли (blockIfViewing) здесь нет намеренно: примерка — это
// про то, что нарисовано на экране, а выходит из приложения настоящий
// человек своей настоящей учёткой. Запрещать ему выход, пока он смотрит
// глазами мастера, не за что.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, authCookieAttributes } from "@/lib/auth-cookies";
import { serviceContext } from "@/lib/context";
import { todayLocal } from "@/lib/format";
import { clearPostMarks } from "@/lib/post-cookie";
import { VIEW_COOKIE } from "@/lib/role-cookie";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function logoutAction(): Promise<void> {
  // Пока сессия жива: снять человека с подъёмника. Ровно так же, как «ушёл
  // со смены» (lib/post-cookie.ts) — снимаются отметки, а принятые машины
  // остаются: машина, которую человек принял, остаётся за ним до конца
  // работы, и выход через обед не должен стирать его же работы.
  const ctx = await serviceContext();
  if (ctx) await clearPostMarks(ctx, todayLocal());

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("[выход] GoTrue не погасил сессию:", error.message);

  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (c.name === AUTH_COOKIE_NAME || c.name.startsWith(`${AUTH_COOKIE_NAME}.`)) {
      jar.set(c.name, "", { ...authCookieAttributes, path: "/", maxAge: 0 });
    }
  }
  // Примерка роли (lib/role-cookie.ts) выход бы пережила: она в куке
  // устройства. Следующему за этим планшетом — хоть тому же человеку —
  // достался бы чужой «просмотр глазами мастера» и половина приложения
  // без объяснения.
  jar.delete(VIEW_COOKIE);

  // Дальше — на экран входа. Свои экраны приложения без куки не откроются:
  // «назад» упрётся в тот же замок (src/proxy.ts), а не покажет записи
  // сервиса вышедшему.
  redirect("/vhod");
}
