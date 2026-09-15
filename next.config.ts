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
};

export default nextConfig;
