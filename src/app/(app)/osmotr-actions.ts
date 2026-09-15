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
  addDefect, createPhotoUpload, fetchInspection, fetchPresets, isSeverity, removeDefect, startInspection, updateDefect,
  type Defect, type PhotoUpload,
} from "@/lib/api/inspections";
import type { ApiResult } from "@/lib/api/site-api";
import { fetchReportPdf, sendReport, setEstimateItem } from "@/lib/api/reports";
import { serviceContext } from "@/lib/context";
import { customWorks, kmLabel, NEGOTIABLE_WORK, parseOdometer, photoIdsFrom } from "@/lib/inspection";
import { isNodeKey } from "@/lib/inspection-nodes";
import { listServices } from "@/lib/services";

function back(path: string, q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
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
 * Начать осмотр с пробегом. Число проверяем здесь, чтобы человек увидел
 * понятное «введите пробег», а не ответ сайта; но «пробег уехал назад»
 * знает только сайт — его validation_error показываем как есть.
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
  back(bare(ret), { d: dayOf(ret), ok: `Пробег: ${kmLabel(res.data.odometerKm)}` });
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
    const keep = { d: dayOf(ret), do: "preset", node: nodeKey };
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
    res = await addDefect({ ...base, title, severity, work, listingId: listing?.listingId ?? null });
  }
  revalidateInspection(bookingId);
  if (!res.ok) back(bare(ret), { d: dayOf(ret), err: res.error });
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

/** PDF собирает сайт; мы только уводим по ссылке. Не собрался — тост на экране. */
export async function reportPdfAction(fd: FormData) {
  const c = await ctx();
  const bookingId = int(fd, "bookingId");
  const inspectionId = int(fd, "inspectionId");
  if (!bookingId || !inspectionId) redirect("/segodnya");
  const ret = returnTo(fd, `/zapis/${bookingId}/otchet`);
  const res = await fetchReportPdf({ shopId: c.shop.id, actorUserId: c.userId, inspectionId });
  if (!res.ok || !/^https?:\/\//.test(res.data.url)) back(bare(ret), { d: dayOf(ret), pdf: res.ok ? "Сайт не дал ссылку на PDF" : res.error });
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
  const type = /^image\/[\w.+-]+$/.test(contentType) ? contentType : "image/jpeg";
  const res = await createPhotoUpload({ shopId: c.shop.id, actorUserId: c.userId, contentType: type });
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}

/**
 * Пришить загруженный кадр к дефекту. Список фото у сайта — целиком, поэтому
 * сначала читаем, что уже есть, и дописываем: два кадра подряд с телефона
 * не должны затирать друг друга.
 */
export async function attachPhotoAction(input: { bookingId: number; defectId: number; photoId: string }): Promise<ClientResult> {
  const c = await serviceContext();
  if (!c || !can(c.role, "inspect")) return { ok: false, error: "Нет доступа" };
  const [photoId] = photoIdsFrom([input.photoId]);
  if (!photoId || !Number.isInteger(input.bookingId) || !Number.isInteger(input.defectId)) return { ok: false, error: "Кадр не опознан" };
  const insp = await fetchInspection({ shopId: c.shop.id, actorUserId: c.userId, bookingId: input.bookingId });
  if (!insp.ok) return { ok: false, error: insp.error };
  const defect = insp.data.defects.find(d => d.id === input.defectId);
  if (!defect) return { ok: false, error: "Дефект уже убран из отчёта" };
  const photoIds = [...defect.photos.map(p => p.id), photoId];
  const res = await updateDefect({ shopId: c.shop.id, actorUserId: c.userId, defectId: defect.id, photoIds });
  if (!res.ok) return { ok: false, error: res.error };
  revalidateInspection(input.bookingId);
  return { ok: true, data: undefined };
}
