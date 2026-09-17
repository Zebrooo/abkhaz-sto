"use server";
// Примерка роли: хозяин смотрит приложение глазами мастера или админа и
// возвращается к себе. Ничего, кроме куки на этом устройстве, действия не
// трогают — ни прав, ни справочника, ни сайта (lib/role-view.ts).
//
// Гейт здесь особенный: примерять может только НАСТОЯЩИЙ хозяин, поэтому
// проверяем realRole, а не role. Иначе, примерив мастера, человек потерял бы
// кнопку возврата — мастеру раздел «Доступы» закрыт.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serviceContext } from "@/lib/context";
import { clearRoleView, saveRoleView } from "@/lib/role-cookie";
import { isViewableRole } from "@/lib/role-view";
import { STO_ROLE_LABEL } from "@/lib/access";

const MENU = "/menu";

function back(q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${MENU}?${s}` : MENU);
}

/** Роль меняет вкладки, меню и адреса по умолчанию — обновляем весь каркас. */
function revalidateShell() {
  revalidatePath("/", "layout");
}

export async function setRoleViewAction(fd: FormData) {
  const c = await serviceContext();
  if (!c) redirect("/vhod");
  if (c.realRole !== "owner") back({ err: "Примерять роли может только хозяин сервиса" });
  const role = String(fd.get("role") ?? "").trim();
  // «Хозяин» — это не примерка, а возврат к себе: отдельной куки для своей
  // роли не нужно, и держать её опасно (учётка на общем телефоне за стойкой).
  if (role === "owner") {
    await clearRoleView();
    revalidateShell();
    back({ ok: "Вы снова хозяин" });
  }
  if (!isViewableRole(role)) back({ err: "Такой роли нет" });
  await saveRoleView({ shopId: c.shop.id, userId: c.userId }, role);
  revalidateShell();
  back({ ok: `Смотрите как ${STO_ROLE_LABEL[role].toLowerCase()} — кнопки и пути теперь его. Это просмотр: ничего не сохраняется` });
}

/**
 * Кнопка «вернуться к своей роли» из полосы примерки: работает с любого
 * экрана и возвращает на него же. Уводить человека на первый экран роли
 * значило бы терять то, что он смотрел; а если этот экран его роли закрыт,
 * гейт сам отправит куда надо.
 */
export async function clearRoleViewAction(fd: FormData) {
  const c = await serviceContext();
  if (!c) redirect("/vhod");
  await clearRoleView();
  revalidateShell();
  const here = String(fd.get("here") ?? "").trim();
  redirect(here.startsWith("/") && !here.startsWith("//") ? here : "/");
}
