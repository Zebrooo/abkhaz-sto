import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone — тот же способ запуска, что у сайта: образ несёт только
  // .next/standalone и статику.
  output: "standalone",
  // Как у сайта: карты остаются внутри образа для разбора ошибок.
  productionBrowserSourceMaps: true,
  // ISR-кэш в памяти выключен, как на сайте (комментарий там): кэш на диске
  // общий для воркеров, копия в каждом процессе — лишняя.
  cacheMaxMemorySize: 0,
  // Файлы-ассоциации приложения обязаны лежать по /.well-known/. Сегмент-роут
  // с ведущей точкой в этой версии Next не гарантирован, поэтому хендлеры
  // живут по /well-known/ (без точки), а наружу выставлены отсюда. beforeFiles
  // — чтобы правило выиграло у файловых маршрутов. Тот же приём у площадки.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/.well-known/apple-app-site-association",
          destination: "/well-known/apple-app-site-association",
        },
        { source: "/.well-known/assetlinks.json", destination: "/well-known/assetlinks" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
