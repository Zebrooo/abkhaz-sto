"use server";
// Чат с клиентом: отправить сообщение в тред на сайте. Как все действия
// приложения — контекст → роль → библиотека сайта → revalidate → назад с
// итогом в адресе. Переписка живёт у сайта, здесь только форма.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { sendMessage } from "@/lib/api/chat";
import { serviceContext } from "@/lib/context";

/** Длиннее одного экрана клиент всё равно не прочитает; сайт режет по-своему. */
const MAX_TEXT = 2000;

function back(path: string, q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${path}?${s}` : path);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function sendMessageAction(fd: FormData) {
  const ctx = await serviceContext();
  if (!ctx) redirect("/");
  const threadId = str(fd, "threadId");
  if (!threadId) redirect("/chat");
  const ret = `/chat/${encodeURIComponent(threadId)}`;
  if (!can(ctx.role, "chat")) back(ret, { err: "Чат ведут мастер и администратор" });
  const text = str(fd, "text").slice(0, MAX_TEXT);
  if (!text) back(ret, { err: "Напишите сообщение" });

  const res = await sendMessage({ shopId: ctx.shop.id, actorUserId: ctx.userId, threadId, text });
  revalidatePath(ret);
  revalidatePath("/chat");
  if (res.ok) back(ret, { ok: "Отправлено" });
  // Маршрута отправки на сайте ещё нет: не «ошибка», а честное «пока отвечайте
  // на сайте». Экран по nosend прячет форму и показывает переход по threadUrl,
  // а текст возвращаем в адрес — набранное не должно пропасть.
  if (res.code === "not_found") back(ret, { nosend: "1", q: text });
  back(ret, { err: res.error, q: text });
}
