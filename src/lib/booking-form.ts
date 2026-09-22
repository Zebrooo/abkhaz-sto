// Мастер ручной записи: развилки, на которых окно, выбранное прямо на сетке,
// теряется молча, — какая услуга стоит по умолчанию, какие услуги вообще
// показывать и куда ведёт «Далее». Все чистые и под тестами
// (booking-form.test.ts).
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
 * Совпадает ли услуга с запросом из поиска по списку. Подстрока названия без
 * учёта регистра; ё считаем за е, потому что в названиях пишут и «колёс», и
 * «колес», а человек в поиске — как придётся.
 */
export function matchesService(title: string, query: string): boolean {
  const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е");
  const q = fold(query.trim());
  return q === "" || fold(title).includes(q);
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

/**
 * Услуги, которые влезают в выбранное окно, — остальные из списка убираем:
 * предлагать трёхчасовую работу в часовое окно значит звать человека в
 * ошибку, которую он увидит только на кнопке «Записать».
 *
 * Две оговорки, обе намеренные:
 *  - времени в адресе нет — показываем всё: во что мерить, ещё не выбрано;
 *  - не влезает ни одна — тоже показываем всё, иначе экран остаётся с пустым
 *    списком и человеку нечего нажать; про само окно скажет подсказка.
 * Выбранная услуга (keepId) остаётся в списке всегда: её и запишет форма,
 * а прятать то, что вот-вот отправится, — врать про своё же состояние.
 */
export function fittingServices<T extends FormService>(input: {
  services: readonly T[];
  schedule: StoSchedule;
  startsAt: Date | null;
  postNo: number | null;
  busy: readonly BusyInterval[];
  now: Date;
  /** Выбранная услуга: остаётся, даже если в окно не влезает. */
  keepId?: number;
}): { list: T[]; hidden: number } {
  const { services, startsAt } = input;
  if (!startsAt) return { list: [...services], hidden: 0 };
  const fits = services.filter(s => isSlotFree({
    schedule: input.schedule,
    startsAt,
    durationMin: s.durationMin,
    busy: input.busy,
    postNo: input.postNo ?? undefined,
    now: input.now,
  }).ok);
  if (fits.length === 0) return { list: [...services], hidden: 0 };
  const list = services.filter(s => s.listingId === input.keepId || fits.includes(s));
  return { list, hidden: services.length - list.length };
}
