"use server";
// Заметка сервиса о клиенте — одно действие: сохранить текст по clientKey на
// сайте. Пустой текст стирает заметку, отдельного «удалить» нет (lib/api/
// client-notes.ts). Порядок как у всех действий: контекст → роль → сайт →
// revalidate → назад в карточку клиента с итогом в адресе.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { saveClientNote } from "@/lib/api/client-notes";
import { serviceContext } from "@/lib/context";

/** Заметка — пара строк за стойкой, а не досье; длиннее не читается в карточке. */
const MAX_TEXT = 1000;

function back(path: string, q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${path}?${s}` : path);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveClientNoteAction(fd: FormData) {
  const ctx = await serviceContext();
  if (!ctx) redirect("/");
  const clientKey = str(fd, "clientKey");
  if (!clientKey) redirect("/klienty");
  // Ключ в адресе — тот же, что пришёл со страницы: она умеет читать и
  // раскодированный, и закодированный вид, а нам важно вернуться в ту же карточку.
  const ret = `/klienty/${clientKey}`;
  if (!can(ctx.role, "clients")) back(ret, { err: "Заметки о клиентах ведут администратор и хозяин" });
  const text = str(fd, "text").slice(0, MAX_TEXT);

  const res = await saveClientNote({ shopId: ctx.shop.id, actorUserId: ctx.userId, clientKey, text });
  revalidatePath(ret);
  revalidatePath("/klienty");
  if (!res.ok) back(ret, { do: "note", err: res.error });
  back(ret, { ok: text ? "Заметка сохранена" : "Заметка стёрта" });
}
