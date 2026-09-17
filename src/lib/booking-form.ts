// Мастер ручной записи: две развилки, на которых окно, выбранное прямо на
// сетке, теряется молча, — какая услуга стоит по умолчанию и куда ведёт
// «Далее». Обе чистые и под тестами (booking-form.test.ts).
//
// Откуда взялось: на сетке дня человек жмёт свободное окно («10:00, пост 2»),
// и адрес несёт день, пост и время. Услуги в нём нет — её выбирают здесь, и
// длина окна считается от неё. Поэтому услугой по умолчанию берём не первую
// в списке, а первую, которая в это окно влезает: иначе выбранное время сразу
// «не подходит» и человек проходит мастер заново.
import type { StoSchedule } from "@/lib/sto/schedule";
import { isSlotFree, type BusyInterval } from "@/lib/sto/slots";

export type FormService = { listingId: number; durationMin: number };

/**
 * Услуга шага 1: выбранная человеком, иначе — первая, что встаёт в окно с
 * сетки, иначе — первая в списке. Свободу окна проверяет тот же isSlotFree,
 * что и запись, поэтому услуга, предложенная здесь, точно запишется.
 */
export function pickService<T extends FormService>(input: {
  services: readonly T[];
  /** listingId из адреса: 0 или чужой — человек услугу ещё не выбирал. */
  chosenId: number;
  schedule: StoSchedule;
  /** Окно из адреса; null — времени в адресе не было. */
  startsAt: Date | null;
  /** Пост из адреса; null — любой свободный, как в списке окон. */
  postNo: number | null;
  busy: readonly BusyInterval[];
  now: Date;
}): T | undefined {
  const { services, startsAt } = input;
  const chosen = services.find(s => s.listingId === input.chosenId);
  if (chosen) return chosen;
  if (startsAt) {
    const fits = services.find(s => isSlotFree({
      schedule: input.schedule,
      startsAt,
      durationMin: s.durationMin,
      busy: input.busy,
      postNo: input.postNo ?? undefined,
      now: input.now,
    }).ok);
    if (fits) return fits;
  }
  return services[0];
}

/**
 * Куда ведёт «Далее» на телефоне. Окно уже выбрано (пришли с сетки или ткнули
 * его в списке) — шаг «Когда» пропускаем: переспрашивать про день, пост и
 * время, которые человек только что назвал, незачем. Вернуться к ним можно
 * кнопкой «Назад» — она по-прежнему ведёт на шаг назад.
 */
export function nextStep(step: number, hasSlot: boolean): number {
  if (step <= 0) return hasSlot ? 2 : 1;
  return Math.min(2, step + 1);
}
