// Подпись «часы работы» для витрины из расписания CRM. Сайт показывает на
// странице магазина текстовое поле shops.work_hours; раньше его писали
// руками в кабинете витрины, и оно молча расходилось с расписанием сервиса
// («ежедневно», когда понедельник — выходной). Теперь при каждом сохранении
// расписания приложение пишет подпись само — CRM единственный источник
// правды о часах приёма сервиса.
//
// Разовые выходные (daysOff) в подпись не идут: это даты, а не режим работы.
import type { StoDay, StoInterval, StoSchedule } from "@/lib/sto/schedule";
import { STO_DAYS } from "@/lib/sto/schedule";

const DAY_SHORT: Record<StoDay, string> = {
  mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс",
};

/** «09:00» → «9:00» — как пишут люди и как было в ручных подписях. */
const clock = (s: string) => s.replace(/^0/, "");

const spanText = (list: readonly StoInterval[]) =>
  list.map(i => `${clock(i.from)}–${clock(i.to)}`).join(" и ");

/**
 * «ежедневно 9:00–18:00», «вт–вс 9:00–18:00, пн — выходной»,
 * «пн–пт 9:00–13:00 и 14:00–18:00, сб, вс — выходные».
 * Пустое расписание (ни одного рабочего дня) — пустая строка: такой подписью
 * ручной текст не перетираем.
 */
export function workHoursLabel(schedule: StoSchedule): string {
  const text = (d: StoDay) => spanText(schedule.days[d] ?? []);
  // Группы подряд идущих дней с одинаковыми часами — как пишут на табличках.
  type Group = { from: number; to: number; text: string };
  const groups: Group[] = [];
  STO_DAYS.forEach((d, i) => {
    const t = text(d);
    if (!t) return;
    const last = groups[groups.length - 1];
    if (last && last.to === i - 1 && last.text === t) last.to = i;
    else groups.push({ from: i, to: i, text: t });
  });
  if (groups.length === 0) return "";
  const off = STO_DAYS.filter(d => text(d) === "");
  if (off.length === 0 && groups.length === 1) return `ежедневно ${groups[0].text}`;
  const range = (g: Group) => g.from === g.to
    ? DAY_SHORT[STO_DAYS[g.from]]
    : `${DAY_SHORT[STO_DAYS[g.from]]}–${DAY_SHORT[STO_DAYS[g.to]]}`;
  const parts = groups.map(g => `${range(g)} ${g.text}`);
  if (off.length > 0) {
    parts.push(`${off.map(d => DAY_SHORT[d]).join(", ")} — ${off.length > 1 ? "выходные" : "выходной"}`);
  }
  return parts.join(", ");
}
