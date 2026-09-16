// Android App Links для «АбхазАвто Бизнес» — та же задача, что у AASA рядом:
// ссылка на этот домен открывается приложением, а не браузером.
//
// ⚠️ ОТПЕЧАТКИ ПОДПИСИ ПОКА ПУСТЫ. Android-сборки у приложения ещё не было
// (каталог android/ перенесён из родительского репозитория и не проверялся), и
// подписать заявку нечем. Пустой список — честное «приложение домен не
// подтверждает»: Android просто откроет браузер. Как только появится ключ
// подписи, сюда кладётся SHA-256 отпечаток, и ссылки начнут открываться в
// приложении. Держать файл с заведомо неверным отпечатком хуже: система кэширует
// проверку и потом долго не повторяет её.
const ASSETLINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "ru.abkhazauto.business",
      sha256_cert_fingerprints: [] as string[],
    },
  },
];

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(ASSETLINKS), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
