import { redirect } from "next/navigation";
import { requireSection } from "@/lib/context";
import { inspectHref } from "@/lib/master-day";
import { todayLocal } from "@/lib/format";

/**
 * «Осмотр» из вкладок, левого меню и «Ещё» — постоянный адрес. Куда он ведёт
 * на самом деле, зависит от текущей записи (мастеру — своя, стойке — идущая
 * сейчас на любом посту; осматривать нечего — новый осмотр или отчёты), и
 * раньше этот расчёт делал layout: два HTTP к сайту (мастера и привязки) на
 * каждый рендер КАЖДОГО экрана у всех ролей — только чтобы подписать ссылку.
 * Теперь расчёт происходит один раз — когда по ссылке действительно перешли.
 *
 * Поведение по ролям прежнее: у кого раздела inspect нет, тому навигация
 * ссылку и не рисует (lib/nav.ts), а прямой заход requireSection уводит на
 * первый экран роли.
 */
export default async function InspectEntryPage() {
  const ctx = await requireSection("inspect");
  // Нет сервиса — layout уже нарисовал объяснение, странице рисовать нечего.
  if (!ctx) return null;
  redirect(await inspectHref(ctx, todayLocal(), new Date()));
}
