"use server";
// Серверные действия блока «люди»: доступы, мастера и мастер записи.
// Каждое: serviceContext → can(role, раздел) → вызов сайта (lib/api/*) →
// revalidatePath → назад на экран с итогом в адресе (?ok= / ?err=).
//
// Проверка роли здесь — подсказка, а не граница: сайт сверяет actorUserId
// сам и откажет, если роль не та. Но уводить человека на сайт за отказом,
// который мы и так знаем, незачем — говорим сразу.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, isStoRole, type Section } from "@/lib/access";
import { blockIfViewing, serviceContext, type ServiceContext } from "@/lib/context";
import { assignBookingMaster, createMaster, updateMaster } from "@/lib/api/masters";
import { inviteMember, setMemberActive, setMemberRole } from "@/lib/api/members";
import { count } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";

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

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Кто и откуда: нет сервиса — на вход; раздел закрыт роли — назад с отказом. */
async function ctx(section: Section, ret: string): Promise<ServiceContext> {
  const c = await serviceContext();
  if (!c) redirect("/");
  blockIfViewing(c);
  if (!can(c.role, section)) back(bare(ret), { err: section === "access" ? "Это может только хозяин сервиса" : "Это может админ или хозяин сервиса" });
  return c;
}

/** Экраны, где видно мастера записи: после смены привязки обновляем все. */
function revalidateMasters() {
  revalidatePath("/mastera");
  revalidatePath("/moi-raboty");
  revalidatePath("/");
  revalidatePath("/segodnya");
  revalidatePath("/menu");
}

// ─────────── Доступы ───────────

export async function inviteMemberAction(fd: FormData) {
  const c = await ctx("access", "/dostupy");
  const role = str(fd, "role");
  if (!isStoRole(role) || role === "owner") back("/dostupy", { do: "invite", err: "Роль — мастер или админ" });
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) back("/dostupy", { do: "invite", role, err: "Телефон не разобран — укажите в формате +7…" });
  const name = str(fd, "name").slice(0, 80);
  const res = await inviteMember({ shopId: c.shop.id, actorUserId: c.userId, phone, role, name: name || undefined });
  revalidatePath("/dostupy");
  if (!res.ok) back("/dostupy", { do: "invite", role, err: res.error });
  back("/dostupy", { ok: res.data.pending ? "Приглашение ушло по SMS — роль включится после входа" : "Сотрудник добавлен" });
}

export async function setMemberRoleAction(fd: FormData) {
  const c = await ctx("access", "/dostupy");
  const role = str(fd, "role");
  if (!isStoRole(role) || role === "owner") back("/dostupy", { err: "Роль — мастер или админ" });
  const userId = str(fd, "userId");
  if (!userId) back("/dostupy", { err: "Сотрудник не указан" });
  const res = await setMemberRole({ shopId: c.shop.id, actorUserId: c.userId, userId, role });
  revalidatePath("/dostupy");
  back("/dostupy", res.ok ? { ok: role === "admin" ? "Теперь админ" : "Теперь мастер" } : { err: res.error });
}

export async function setMemberActiveAction(fd: FormData) {
  const c = await ctx("access", "/dostupy");
  const userId = str(fd, "userId");
  if (!userId) back("/dostupy", { err: "Сотрудник не указан" });
  const active = str(fd, "active") === "1";
  const res = await setMemberActive({ shopId: c.shop.id, actorUserId: c.userId, userId, active });
  revalidatePath("/dostupy");
  back("/dostupy", res.ok ? { ok: active ? "Доступ включён" : "Доступ выключен" } : { err: res.error });
}

// ─────────── Мастера ───────────

export async function createMasterAction(fd: FormData) {
  const c = await ctx("masters", "/mastera");
  if (c.role !== "owner") back("/mastera", { err: "Мастеров заводит хозяин сервиса" });
  const name = str(fd, "name").slice(0, 80);
  if (!name) back("/mastera", { do: "add", err: "Имя мастера обязательно" });
  const postRaw = Number(str(fd, "postNo"));
  const postNo = Number.isInteger(postRaw) && postRaw > 0 ? postRaw : null;
  const res = await createMaster({
    shopId: c.shop.id, actorUserId: c.userId, name, speciality: str(fd, "speciality").slice(0, 80), postNo,
  });
  revalidateMasters();
  if (!res.ok) back("/mastera", { do: "add", err: res.error });
  back("/mastera", { ok: `Добавлен: ${res.data.name}` });
}

/**
 * Снять со смены или вернуть. Снятый мастер оставляет записи на посту —
 * сайт отвечает их номерами (orphaned), и экран несёт их в адресе, чтобы
 * плашка «остались без мастера» пережила перезагрузку и «Передать» знал,
 * что передавать.
 */
export async function toggleMasterShiftAction(fd: FormData) {
  const c = await ctx("masters", "/mastera");
  const masterId = Number(str(fd, "masterId"));
  if (!Number.isInteger(masterId) || masterId <= 0) back("/mastera", { err: "Мастер не указан" });
  const onShift = str(fd, "onShift") === "1";
  const res = await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId, onShift });
  revalidateMasters();
  if (!res.ok) back("/mastera", { err: res.error });
  if (onShift) back("/mastera", { ok: `${res.data.master.name} на смене` });
  const orphaned = res.data.orphaned.filter(id => Number.isInteger(id) && id > 0);
  back("/mastera", {
    ok: `${res.data.master.name} снят со смены`,
    m: orphaned.length ? String(masterId) : undefined,
    orphaned: orphaned.length ? orphaned.join(",") : undefined,
  });
}

/**
 * Правка мастера хозяином: имя, специальность, пост, увольнение и возврат в
 * штат.
 *
 * ПАТЧ СТРОГО ЧАСТИЧНЫЙ, и это не аккуратность, а необходимость. Пост мастера
 * пишет не только хозяин: утром мастер сам отмечается на подъёмнике
 * (post-actions.ts) и заодно обновляет postNo в справочнике. Если форма
 * правки отправит все поля разом, хозяин, поправивший опечатку в имени, молча
 * вернёт человека на вчерашний пост. Поэтому форма несёт прежние значения
 * (was*), а на сайт уезжает только то, что действительно изменилось.
 *
 * Смена поста и увольнение оставляют записи на местах — сайт отвечает их
 * номерами (orphaned), и мы несём их в адрес так же, как переключатель смены.
 */
export async function updateMasterAction(fd: FormData) {
  // Раздел «Мастера» открыт админу и хозяину — правят оба: админ за стойкой
  // исправляет опечатку в имени и переставляет человека на другой подъёмник,
  // не дёргая хозяина. А вот уволить и вернуть в штат может только хозяин:
  // это решение о человеке, а не о сегодняшней смене (проверка ниже).
  const c = await ctx("masters", "/mastera");
  const masterId = Number(str(fd, "masterId"));
  if (!Number.isInteger(masterId) || masterId <= 0) back("/mastera", { err: "Мастер не указан" });
  // Отказ возвращает в ту же шторку, а не на общий экран: иначе набранное
  // имя пропадёт, и человек будет гадать, что не понравилось.
  const sheet = { do: "edit", edit: String(masterId) };

  const fire = str(fd, "fire");
  if (fire === "1" || fire === "0") {
    if (c.role !== "owner") back("/mastera", { ...sheet, err: "Уволить и вернуть в штат может только хозяин сервиса" });
    const active = fire === "0";
    const res = await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId, active });
    revalidateMasters();
    if (!res.ok) back("/mastera", { ...sheet, err: res.error });
    const orphaned = res.data.orphaned.filter(id => Number.isInteger(id) && id > 0);
    back("/mastera", {
      ok: active ? `${res.data.master.name} снова в штате` : `${res.data.master.name} уволен — записи остались на постах`,
      // Уволенного в общем списке не видно, поэтому и плашку «передайте
      // записи» вешать не на кого: показываем список уволенных.
      all: active ? undefined : "1",
      m: orphaned.length ? String(masterId) : undefined,
      orphaned: orphaned.length ? orphaned.join(",") : undefined,
    });
  }

  const name = str(fd, "name").slice(0, 80);
  if (!name) back("/mastera", { ...sheet, err: "Имя мастера обязательно" });
  const speciality = str(fd, "speciality").slice(0, 80);
  const postRaw = str(fd, "postNo");
  const postNo = postRaw === "" || postRaw === "0" ? null : Number(postRaw);
  if (postNo !== null && (!Number.isInteger(postNo) || postNo <= 0)) back("/mastera", { ...sheet, err: "Такого поста у сервиса нет" });

  const wasPostRaw = str(fd, "wasPostNo");
  const wasPost = wasPostRaw === "" || wasPostRaw === "0" ? null : Number(wasPostRaw);
  const patch = {
    ...(name !== str(fd, "wasName") ? { name } : {}),
    ...(speciality !== str(fd, "wasSpeciality") ? { speciality } : {}),
    ...(postNo !== wasPost ? { postNo } : {}),
  };
  if (Object.keys(patch).length === 0) back("/mastera", { ok: "Ничего не изменилось" });

  const res = await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId, ...patch });
  revalidateMasters();
  if (!res.ok) back("/mastera", { ...sheet, err: res.error });
  const orphaned = res.data.orphaned.filter(id => Number.isInteger(id) && id > 0);
  back("/mastera", {
    ok: `Сохранено: ${res.data.master.name}`,
    m: orphaned.length ? String(masterId) : undefined,
    orphaned: orphaned.length ? orphaned.join(",") : undefined,
  });
}

/** Передать осиротевшие записи другому мастеру — по одной, все разом. */
export async function handoffAction(fd: FormData) {
  const c = await ctx("masters", "/mastera");
  const toMasterId = Number(str(fd, "toMasterId"));
  if (!Number.isInteger(toMasterId) || toMasterId <= 0) back("/mastera", { err: "Выберите, кому передать" });
  const ids = str(fd, "bookingIds").split(",").map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0) back("/mastera", { err: "Передавать нечего" });
  const results = await Promise.all(ids.map(bookingId =>
    assignBookingMaster({ shopId: c.shop.id, actorUserId: c.userId, bookingId, masterId: toMasterId })));
  revalidateMasters();
  const errors = results.flatMap(r => (r.ok ? [] : [r.error]));
  if (errors.length === results.length) back("/mastera", { err: errors[0] });
  const done = results.length - errors.length;
  // Часть не прошла — это ошибка, а не успех: человек должен увидеть, что
  // передать надо ещё раз; сколько удалось, скажем там же.
  if (errors.length) back("/mastera", { err: `Передано ${done} из ${results.length}: ${errors[0]}` });
  back("/mastera", { ok: count(done, "запись передана", "записи переданы", "записей передано") });
}

// ─────────── Мастер записи ───────────

/** Назначить мастера на запись из её карточки; masterId «0» снимает назначение. */
export async function assignMasterAction(fd: FormData) {
  const ret = returnTo(fd, "/segodnya");
  const c = await ctx("masters", ret);
  const bookingId = Number(str(fd, "bookingId"));
  if (!Number.isInteger(bookingId) || bookingId <= 0) back(bare(ret), { err: "Запись не указана" });
  const raw = Number(str(fd, "masterId"));
  const masterId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const res = await assignBookingMaster({ shopId: c.shop.id, actorUserId: c.userId, bookingId, masterId });
  revalidateMasters();
  revalidatePath(`/zapis/${bookingId}`);
  const name = str(fd, "masterName");
  back(bare(ret), res.ok ? { ok: masterId ? `Мастер записи: ${name || "назначен"}` : "Мастер снят — запись на посту" } : { err: res.error });
}
