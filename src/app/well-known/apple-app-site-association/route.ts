// iOS Universal Links для приложения «АбхазАвто Бизнес». Apple забирает файл по
// https://<host>/.well-known/apple-app-site-association и, если в сборке включён
// entitlement `applinks:<host>`, открывает ссылки этого домена в приложении, а не
// в браузере.
//
// ЗАЧЕМ ЗДЕСЬ, А НЕ У ПЛОЩАДКИ. Кнопка «СРМ автосервиса» в «Моих магазинах» ведёт
// на business.abkhaz-auto.ru. С телефона она должна открывать приложение, если оно
// стоит, а не разворачивать рабочее место внутри браузера. Заявку на домен делает
// тот, кому домен принадлежит, — то есть это приложение.
//
// ⚠️ Путь наружу — /.well-known/..., внутрь ведёт rewrite в next.config.ts
// (beforeFiles). Сегмент с ведущей точкой в этой версии Next не гарантирован,
// а rewrite однозначен. Content-Type задаём сами: у файла нет расширения.
//
// ⚠️ И ещё: путь обязан быть ПУБЛИЧНЫМ (src/proxy.ts, PUBLIC_PATHS). Apple ходит
// сюда без куки, и замок сессии отдал бы ей страницу входа вместо файла.
//
// appID = <Apple Team ID>.<bundle id>. Меняется только при смене аккаунта
// разработчика или бандла — тогда правится и здесь, и в entitlements оболочки.
const APP_ID = "L9R5PZ4E3U.ru.abkhazauto.business";

// Заявляем весь хост, КРОМЕ ручек и входа. Порядок важен: iOS берёт первое
// совпадение, поэтому все NOT идут до финального "*".
//  • /api/* — серверные ручки, включая cookie-мост оболочки: перехватывать их
//    приложению незачем, а мост обязан оставаться обычным HTTP-вызовом;
//  • /vhod — вход. Если ссылка входа уйдёт в приложение, а сессии в нём нет,
//    человек упрётся в тот же экран входа, из которого пришёл.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: APP_ID,
        paths: ["NOT /api/*", "NOT /vhod", "NOT /vhod/*", "*"],
      },
    ],
  },
};

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(AASA), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=86400",
      "x-robots-tag": "noindex",
    },
  });
}
