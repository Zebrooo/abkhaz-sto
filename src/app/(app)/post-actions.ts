"use server";
// «Я занял подъёмник» и «ушёл со смены» — единственные действия, которые
// человек делает про СЕБЯ, а не про сервис. Поэтому гейт здесь не раздел
// «Мастера» (он мастеру закрыт, и правильно: там заводят людей и снимают
// чужие смены), а «Записи»: отметиться может любой, кто вообще работает с
// записями — мастер, админ и хозяин, который сам стоит у подъёмника.
//
// Порядок намеренный: сначала отметка на устройстве (это рабочий путь —
// именно по ней экран наполняется записями), потом best-effort на сайт,
// чтобы хозяин видел, кто где стоит. Отказ сайта отметку не отменяет и
// ошибкой не показывается: мастер уже стоит у машины, и ему всё равно, что
// справочник об этом не знает.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, HOME_PATH } from "@/lib/access";
import { updateMaster } from "@/lib/api/masters";
import { dayBookings } from "@/lib/bookings";
import { blockIfViewing, serviceContext } from "@/lib/context";
import { todayLocal } from "@/lib/format";
import { postCount } from "@/lib/mywork";
import { clearPostMarks, savePostMark } from "@/lib/post-cookie";

const MY_POST = "/moi-raboty";

function back(q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${MY_POST}?${s}` : MY_POST);
}

async function ctx() {
  const c = await serviceContext();
  if (!c) redirect("/vhod");
  // Отметка на подъёмнике в примерке тоже не ставится: она уходит в
  // справочник сайта настоящим человеком, и хозяин «отметился бы» всерьёз.
  blockIfViewing(c);
  if (!can(c.role, "bookings")) redirect(HOME_PATH[c.role]);
  return c;
}

/** Экраны, где видно, кто на каком посту. */
function revalidatePost() {
  revalidatePath(MY_POST);
  revalidatePath("/");
  revalidatePath("/segodnya");
  revalidatePath("/mastera");
}

export async function takePostAction(fd: FormData) {
  const c = await ctx();
  const day = todayLocal();
  const postNo = Number(String(fd.get("postNo") ?? "").trim());
  const posts = postCount(c.shop.schedule?.posts, await dayBookings(c.shop.id, day));
  if (!Number.isInteger(postNo) || postNo < 1 || postNo > posts) back({ err: "Такого подъёмника у сервиса нет" });

  await savePostMark(c, day, postNo, new Date());
  // Справочник мастеров — не наш источник правды об отметке, а способ
  // показать её хозяину. Мастера без строки в справочнике (сегодня это все,
  // пока сайт не отдаёт /masters) отметка всё равно обслуживает.
  const shared = c.masterId === null
    ? null
    : await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId: c.masterId, postNo, onShift: true });
  revalidatePost();
  back({
    ok: `Вы на посту ${postNo}`,
    note: shared && !shared.ok ? "Сайт об этом пока не знает — отметка сохранена на этом устройстве" : undefined,
  });
}

/**
 * Мастер правит СВОЮ строку справочника: имя, специальность и пост по
 * умолчанию. Раздел «Мастера» ему закрыт и открывать его нельзя — там чужие
 * люди, их смены и выручка, — поэтому своя карточка живёт здесь, на «Моём
 * посту», и действие физически не умеет тронуть чужой masterId: он берётся
 * из контекста, а не из формы.
 *
 * Патч частичный по той же причине, что и у хозяина (staff-actions.ts):
 * шлём только изменённое, чтобы не переписать то, чего человек не трогал.
 */
export async function updateMyMasterAction(fd: FormData) {
  const c = await ctx();
  if (c.masterId === null) back({ err: "Учётка не привязана к мастеру — править нечего" });
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!name) back({ do: "me", err: "Имя обязательно" });
  const speciality = String(fd.get("speciality") ?? "").trim().slice(0, 80);
  const postRaw = String(fd.get("postNo") ?? "").trim();
  const postNo = postRaw === "" || postRaw === "0" ? null : Number(postRaw);
  if (postNo !== null && (!Number.isInteger(postNo) || postNo <= 0)) back({ do: "me", err: "Такого подъёмника у сервиса нет" });

  const wasPostRaw = String(fd.get("wasPostNo") ?? "").trim();
  const wasPost = wasPostRaw === "" || wasPostRaw === "0" ? null : Number(wasPostRaw);
  const patch = {
    ...(name !== String(fd.get("wasName") ?? "").trim() ? { name } : {}),
    ...(speciality !== String(fd.get("wasSpeciality") ?? "").trim() ? { speciality } : {}),
    ...(postNo !== wasPost ? { postNo } : {}),
  };
  if (Object.keys(patch).length === 0) back({ ok: "Ничего не изменилось" });

  const res = await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId: c.masterId, ...patch });
  revalidatePost();
  back(res.ok ? { ok: "Карточка обновлена" } : { do: "me", err: res.error });
}

export async function leavePostAction() {
  const c = await ctx();
  // Принятые машины остаются за человеком: он их принял, и если вернётся
  // после «ушёл со смены», список работ не должен начаться с чистого листа.
  // Уходит только пост — записи чужого поста этому человеку больше не его.
  await clearPostMarks(c, todayLocal());
  if (c.masterId !== null) {
    await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId: c.masterId, onShift: false });
  }
  revalidatePost();
  back({ ok: "Смена закрыта" });
}
