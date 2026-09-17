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
import { serviceContext } from "@/lib/context";
import { todayLocal } from "@/lib/format";
import { postCount } from "@/lib/mywork";
import { dropPostHold, savePostMark } from "@/lib/post-cookie";

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

export async function leavePostAction() {
  const c = await ctx();
  await dropPostHold();
  if (c.masterId !== null) {
    await updateMaster({ shopId: c.shop.id, actorUserId: c.userId, masterId: c.masterId, onShift: false });
  }
  revalidatePost();
  back({ ok: "Смена закрыта" });
}
