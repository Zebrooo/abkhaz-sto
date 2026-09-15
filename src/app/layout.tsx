import type { Metadata, Viewport } from "next";
// Шрифты — свои файлы, не Google Fonts: у сервиса за стойкой интернет
// бывает узкий, а сборка не должна ходить в сеть за шрифтом. Семьи те же,
// что на сайте: Manrope на всё, JetBrains Mono на время и цифры.
import "@fontsource-variable/manrope";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Абхаз Авто · Сервис",
  description: "Записи, календарь, расписание и прайс автосервиса",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
