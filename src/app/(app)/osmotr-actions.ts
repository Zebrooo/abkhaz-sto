"use server";
// Серверные действия осмотра и отчёта. Каждое: кто и в каком сервисе
// (serviceContext) → роль допускает раздел → вызов сайта (src/lib/api) →
// revalidate → назад на экран с итогом в адресе (?ok= / ?err=).
//
// Права здесь — подсказка, а не граница: настоящий отказ даёт сайт по
// actorUserId (AGENTS.md). Поэтому проверка роли тут короткая и без
// исключений — она не даёт мастеру увидеть кнопку, которой он не может
// воспользоваться, и только.
//
// Два действия внизу — createPhotoUploadAction и attachPhotoAction — зовёт
// клиентский компонент PhotoUpload и ждёт ответ, а не переход: кадр уходит
// в хранилище прямо из браузера, и результат нужен там же.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, HOME_PATH } from "@/lib/access";
import {
  addDefect, createPhotoUpload, fetchInspection, fetchPresets, finishInspection, isSeverity, removeDefect,
  startInspection, updateDefect, updateOdometer,
  type Defect, type PhotoUpload,
} from "@/lib/api/inspections";
import type { ApiResult } from "@/lib/api/site-api";
import { fetchReportPdf, pdfReady, sendReport, setEstimateItem } from "@/lib/api/reports";
import { createWalkInBooking } from "@/lib/bookings";
import { blockIfViewing, serviceContext } from "@/lib/context";
import { todayLocal } from "@/lib/format";
import { currentPost } from "@/lib/post-hold";
import { readPostHold } from "@/lib/post-cookie";
import { vinProblem } from "@/lib/vehicle-input";
import { customWorks, kmLabel, NEGOTIABLE_WORK, parseOdometer, photoIdsFrom } from "@/lib/inspection";
import { isNodeKey } from "@/lib/inspection-nodes";
import { VIEW_ONLY_MESSAGE } from "@/lib/role-view";
import { saveAccepted } from "@/lib/post-cookie";
import { listServices } from "@/lib/services";

function back(path: string, q: Record<string, string | string[] | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) for (const x of v) sp.append(k, x);
    else if (v) sp.set(k, v);
  }
  const s = sp.toString();
  redirect(s ? `${path}?${s}` : path);
}

/** Адрес возврата из формы — только свой путь, без переезда на чужой сайт. */
function returnTo(fd: FormData, fallback: string): string {
  const raw = String(fd.get("return") ?? "").trim();
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

/** Путь без запроса — чтобы дописать свой ?ok= вместо чужого. */
function bare(path: string): string {
  const i = path.indexOf("?");
  return i === -1 ? path : path.slice(0, i);
}

/** День из адреса возврата: без него «назад» уведёт в сегодняшний день. */
function dayOf(path: string): string | undefined {
  const m = /[?&]d=(\d{4}-\d{2}-\d{2})/.exec(path);
  return m ? m[1] : undefined;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function ctx() {
  const c = await serviceContext();
  if (!c) redirect("/vhod");
  blockIfViewing(c);
  if (!can(c.role, "inspect")) redirect(HOME_PATH[c.role]);
  return c;
}

/** Экраны, где виден осмотр: карточка записи, сам осмотр и отчёт. */
function revalidateInspection(bookingId: number) {
  revalidatePath(`/zapis/${bookingId}`);
  revalidatePath(`/zapis/${bookingId}/osmotr`);
  revalidatePath(`/zapis/${bookingId}/otchet`);
}

/**
 * Осмотр без записи: машина заехала с улицы, и мастер не должен ради неё
 * собирать ручную запись из трёх шагов (услуга, окно, клиент). Спрашиваем
 * владельца и машину, запись «Осмотр» создаётся «сейчас» на свободный пост —
 * и сразу открывается осмотр, который первым делом спросит пробег, как у
 * любой записи. Набранное при отказе едет назад в адресе — опечатка в VIN не
 * стирает всё остальное (тот же приём, что у формы записи).
 */
export async function createWalkInAction(fd: FormData) {
  const c = await ctx();
  const name = str(fd, "name");
  const phone = str(fd, "phone");
  const vehicle = str(fd, "vehicle");
  const plate = str(fd, "plate");
  const vin = str(fd, "vin");
  const keep = { n: name, ph: phone, v: vehicle, pl: plate, vin };
  if (!name) back("/osmotr/novyi", { ...keep, err: "Впишите владельца — по имени запись потом ищется" });
  const vinErr = vinProblem(vin);
  if (vinErr) back("/osmotr/novyi", { ...keep, err: vinErr });
  const hold = await readPostHold(c, todayLocal());
  const res = await createWalkInBooking({
    shopId: c.shop.id, schedule: c.shop.schedule, client: { name, phone: phone || null },
    vehicle, plate, vin, preferredPost: currentPost(hold), actorUserId: c.userId,
  });
  if (!res.ok) back("/osmotr/novyi", { ...keep, err: res.error });
  revalidatePath("/segodnya");
  back(`/zapis/${res.id}/osmotr`, { ok: "Запись создана — впишите пробег и начинайте осмотр" });
}

/**
 * Начать осмотр с пробегом — этим же мастер и «принимает машину».
 * Число проверяем здесь, чтобы человек увидел понятное «введите пробег», а
 * не ответ сайта; но «пробег уехал назад» знает только сайт — его
 * validation_error показываем как есть.
 *
 * ОСМОТР ИДЕМПОТЕНТЕН: если его уже начали (второй мастер, или сам человек
 * с другого телефона), сайт возвращает тот, что есть, — с ЧУЖИМ пробегом.
 * Писать «Пробег: 112 300» на введённые 118 000 нельзя: мастер поверит, что
 * его число сохранилось. Поэтому сверяем и говорим как есть.
 */
export async function startInspectionAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  if (!bookingId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/osmotr`);
  const km = parseOdometer(str(fd, "odometer"));
  if (!km.ok) back(bare(ret), { d: dayOf(ret), do: "km", err: km.error });
  const res = await startInspection({ shopId: c.shop.id, actorUserId: c.userId, bookingId, odometerKm: km.km, masterId: c.masterId });
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { d: dayOf(ret), do: "km", err: res.error });
  // Машина теперь за этим человеком: её могут перенести на другой пост, а
  // работает с ней он (lib/post-hold.ts). Отметка — на устройстве, и сорваться
  // из-за неё приёмка не должна: осмотр уже начат.
  try {
    await saveAccepted(c, dayOf(ret) ?? todayLocal(), bookingId);
  } catch {
    // Кука не записалась (редкий случай) — осмотр от этого не отменяется.
  }
  const same = res.data.odometerKm === km.km;
  back(bare(ret), {
    d: dayOf(ret),
    ok: same ? `Пробег: ${kmLabel(res.data.odometerKm)}` : `Осмотр уже начат, пробег в нём: ${kmLabel(res.data.odometerKm)}`,
  });
}

/**
 * Завершить осмотр. Отдельная кнопка, а не «само закроется при отправке
 * отчёта»: мастер сам говорит, что обошёл машину целиком, — и после этого
 * список дефектов уже не меняется.
 *
 * Идемпотентно на стороне сайта, поэтому двойное нажатие в яме не страшно.
 */
export async function finishInspectionAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/osmotr`);
  const res = await finishInspection({ shopId: c.shop.id, actorUserId: c.userId, inspectionId });
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { d: dayOf(ret), err: res.error });
  // Ведём в отчёт: осмотр закрыт, дальше человек отправляет его клиенту.
  back(`/zapis/${bookingId}/otchet`, { d: dayOf(ret), ok: "Осмотр завершён — дефекты больше не меняются" });
}

/**
 * Исправить пробег. Цифру спрашивают на приёмке в спешке, и ошибиться в ней
 * легко; она же уезжает клиенту в отчёт и в историю машины. Правим, пока
 * осмотр не завершён, — после этого сайт отвечает отказом, и переделывать
 * придётся отчёт целиком.
 */
export async function updateOdometerAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/osmotr`);
  const km = parseOdometer(str(fd, "odometer"));
  if (!km.ok) back(bare(ret), { d: dayOf(ret), do: "km", err: km.error });
  const res = await updateOdometer({ shopId: c.shop.id, actorUserId: c.userId, inspectionId, odometerKm: km.km });
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { d: dayOf(ret), do: "km", err: res.error });
  back(bare(ret), { d: dayOf(ret), ok: `Пробег исправлен: ${kmLabel(res.data.odometerKm)}` });
}

/**
 * Дефект в отчёт: по готовой формулировке (presetId) или своими словами.
 * Свою работу привязываем к строке прайса по названию — чипы под полем
 * и есть названия строк; «Цену согласует админ» строки не имеет, и это
 * честная «договорная» в смете.
 */
export async function addDefectAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/osmotr`);
  const nodeKey = str(fd, "nodeKey");
  if (!isNodeKey(nodeKey)) back(bare(ret), { d: dayOf(ret), err: "Неизвестный узел" });
  const photoIds = photoIdsFrom(fd.getAll("photo"));
  const base = { shopId: c.shop.id, actorUserId: c.userId, inspectionId, nodeKey, photoIds };
  // Куда возвращаться при отказе: в ту же шторку, с тем же узлом и уже
  // ушедшими кадрами — иначе три снимка из ямы пропали бы из-за опечатки.
  const keep = { d: dayOf(ret), do: "preset", node: nodeKey, photo: photoIds };

  const presetId = int(fd, "presetId");
  let title: string;
  let res: ApiResult<Defect>;
  if (presetId) {
    title = str(fd, "title");
    res = await addDefect({ ...base, presetId });
  } else {
    title = str(fd, "title").slice(0, 200);
    const severity = str(fd, "severity");
    const work = str(fd, "work").slice(0, 200);
    if (!title) back(bare(ret), { ...keep, err: "Опишите дефект своими словами" });
    if (!isSeverity(severity)) back(bare(ret), { ...keep, err: "Выберите: внимание или критично" });
    if (!work) back(bare(ret), { ...keep, err: "Выберите работу" });
    // Работа обязана быть из чипов: либо строка прайса витрины, либо
    // формулировка каталога узла, либо «договорная». Иначе мастер назначил
    // бы цену сам — этого экран не допускает.
    const [services, presets] = await Promise.all([
      listServices(c.shop.id),
      fetchPresets({ shopId: c.shop.id, actorUserId: c.userId, nodeKey }),
    ]);
    const listing = services.find(s => s.title === work) ?? null;
    const known = work === NEGOTIABLE_WORK || listing || customWorks(presets.ok ? presets.data : []).some(w => w.work === work);
    if (!known) back(bare(ret), { ...keep, err: "Работа — только из списка" });
    // Работа не из прайса (каталог узла, «цену согласует админ») — поля
    // listingId НЕТ, а не null: сайт разбирает JSON буквально, и null уже
    // ломал сохранение дефекта («listingId — целый id услуги из прайса»).
    res = await addDefect({ ...base, title, severity, work, ...(listing ? { listingId: listing.listingId } : {}) });
  }
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { ...keep, err: res.error });
  back(bare(ret), { d: dayOf(ret), ok: `${res.data.title || title} — в отчёте` });
}

export async function removeDefectAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const defectId = int(fd, "defectId");
  if (!bookingId || !defectId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/osmotr`);
  const res = await removeDefect({ shopId: c.shop.id, actorUserId: c.userId, defectId });
  revalidateInspection(bookingId);
  back(bare(ret), res.ok ? { d: dayOf(ret), ok: "Убрано из отчёта" } : { d: dayOf(ret), err: res.error });
}

/** Галочка сметы: пункт в сумму или нет. Сумму пересчитывает сайт. */
export async function toggleItemAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  const defectId = int(fd, "defectId");
  if (!bookingId || !inspectionId || !defectId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/otchet`);
  const included = str(fd, "included") === "1";
  const res = await setEstimateItem({ shopId: c.shop.id, actorUserId: c.userId, inspectionId, defectId, included });
  revalidateInspection(bookingId);
  back(bare(ret), res.ok ? { d: dayOf(ret), ok: included ? "Пункт в смете" : "Пункт исключён из сметы" } : { d: dayOf(ret), err: res.error });
}

/**
 * Передать отчёт дальше. Кому — решает сайт по роли: мастер отдаёт
 * администратору, админ и хозяин — клиенту. Подпись итога подбираем по той
 * же роли, чтобы мастер не прочитал «отправлено клиенту».
 */
export async function sendReportAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/otchet`);
  const res = await sendReport({ shopId: c.shop.id, actorUserId: c.userId, inspectionId });
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { d: dayOf(ret), err: res.error });
  const done = can(c.role, "sendReport") ? "Отчёт с фото отправлен клиенту в чат" : "Отчёт у администратора — он отправит клиенту";
  back(bare(ret), { d: dayOf(ret), ok: done });
}

/** PDF собирает сайт; мы только уводим по ссылке. Не собрался — карточка на экране. */
export async function reportPdfAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/otchet`);
  const res = await fetchReportPdf({ shopId: c.shop.id, actorUserId: c.userId, inspectionId });
  if (!res.ok) back(bare(ret), { d: dayOf(ret), pdf: res.error });
  // Сборка со шрифтами и фото идёт дольше, чем экран готов ждать. Сайт в этом
  // случае отвечает «собирается» — и мы говорим это словами, а не выдаём
  // долгую работу за поломку.
  if (!pdfReady(res.data)) back(bare(ret), { d: dayOf(ret), pdf: "wait" });
  if (!/^https?:\/\//.test(res.data.url)) back(bare(ret), { d: dayOf(ret), pdf: "Сайт не дал ссылку на PDF" });
  redirect(res.data.url);
}

export type ClientResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Одноразовый адрес для кадра. contentType — тип файла из браузера; чужое
 * («text/html») режем до image/jpeg: хранилищу нужен тип картинки, а не
 * то, что назвала камера.
 */
export async function createPhotoUploadAction(contentType: string): Promise<ClientResult<PhotoUpload>> {
  const c = await serviceContext();
  if (!c || !can(c.role, "inspect")) return { ok: false, error: "Нет доступа" };
  if (c.viewing) return { ok: false, error: VIEW_ONLY_MESSAGE };
  const type = /^image\/[\w.+-]+$/.test(contentType) ? contentType : "image/jpeg";
  const res = await createPhotoUpload({ shopId: c.shop.id, actorUserId: c.userId, contentType: type });
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}

/**
 * Пришить загруженный кадр к дефекту. Список фото у сайта — целиком, поэтому
 * сначала читаем, что уже есть, и дописываем: два кадра подряд с телефона
 * не должны затирать друг друга.
 *
 * last — «это последний кадр пачки»: кадры с камеры уходят по несколько
 * подряд, и обновлять экран на каждый — лишние перерисовки и запросы, пока
 * мастер стоит в яме. Полный revalidate делаем один раз, на последнем;
 * промежуточные кадры у сайта уже пришиты, экран догонит на последнем.
 */
export async function attachPhotoAction(input: { bookingId: number; defectId: number; photoId: string; last?: boolean }): Promise<ClientResult> {
  const c = await serviceContext();
  if (!c || !can(c.role, "inspect")) return { ok: false, error: "Нет доступа" };
  if (c.viewing) return { ok: false, error: VIEW_ONLY_MESSAGE };
  const [photoId] = photoIdsFrom([input.photoId]);
  if (!photoId || !Number.isInteger(input.bookingId) || !Number.isInteger(input.defectId)) return { ok: false, error: "Кадр не опознан" };
  const insp = await fetchInspection({ shopId: c.shop.id, actorUserId: c.userId, bookingId: input.bookingId });
  if (!insp.ok) return { ok: false, error: insp.error };
  const defect = insp.data.defects.find(d => d.id === input.defectId);
  if (!defect) return { ok: false, error: "Дефект уже убран из отчёта" };
  const photoIds = [...defect.photos.map(p => p.id), photoId];
  const res = await updateDefect({ shopId: c.shop.id, actorUserId: c.userId, defectId: defect.id, photoIds });
  if (!res.ok) return { ok: false, error: res.error };
  if (input.last) revalidateInspection(input.bookingId);
  return { ok: true, data: undefined };
}
