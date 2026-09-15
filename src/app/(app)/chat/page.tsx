import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { fetchThreads } from "@/lib/api/chat";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { count, initials, relativeAt } from "@/lib/format";

/**
 * Диалоги с клиентами. Переписка живёт на сайте — клиент пишет из своей
 * записи, приложение только читает список (lib/api/chat.ts). На телефоне —
 * список во весь экран, на вебе — левая колонка и пустая правая: диалог
 * открывается своим адресом /chat/<id> и рисует ту же колонку рядом.
 */
export default async function ChatsPage() {
  const ctx = (await requireSection("chat"))!;
  const [res, pending] = await Promise.all([
    fetchThreads(ctx.shop.id, ctx.userId),
    countPending(ctx.shop.id),
  ]);
  // not_found — у сервиса ещё не было ни одного диалога, это не ошибка.
  const threads = res.ok ? res.data : [];
  const failed = !res.ok && res.code !== "not_found" ? res.error : null;
  const unread = threads.reduce((s, t) => s + t.unread, 0);
  const sub = threads.length > 0
    ? `${count(threads.length, "диалог", "диалога", "диалогов")} · ${unread > 0 ? count(unread, "непрочитанный", "непрочитанных", "непрочитанных") : "всё прочитано"}`
    : "диалогов пока нет";

  return (
    <>
      <ScreenHead title="Чат" sub={sub} back="/menu" unread={pending} />
      <div className="page chat-page stack">
        <div className="chat-wrap">
          <div className="chat-list card card-flat">
            {threads.map(t => (
              <Link key={t.id} className="row chat-row" href={`/chat/${encodeURIComponent(t.id)}`}>
                <span className="ava">{initials(t.clientName)}</span>
                <div className="row-main">
                  <div className="chat-top">
                    <span className="chat-n">{t.clientName}</span>
                    <span className="chat-at">{relativeAt(t.lastAt)}</span>
                  </div>
                  <div className="chat-bot">
                    <span className="chat-last">{t.lastText}</span>
                    {t.unread > 0 && <span className="chat-unread">{t.unread}</span>}
                  </div>
                </div>
              </Link>
            ))}
            {threads.length === 0 && (
              <div className="empty">
                <span className="sq"><Icon name="comment" size={26} /></span>
                <div className="empty-t">{failed ? "Сайт пока не отдаёт чат" : "Диалогов пока нет"}</div>
                <div className="empty-s">
                  {failed ?? "Клиент пишет из своей записи на сайте — как только напишет, диалог появится здесь."}
                </div>
              </div>
            )}
          </div>
          <div className="chat-pane chat-pane-empty">
            <div className="empty">
              <span className="sq"><Icon name="comment" size={26} /></span>
              <div className="empty-t">Выберите диалог</div>
              <div className="empty-s">Переписка откроется здесь, шапка записи — над ней.</div>
            </div>
          </div>
        </div>
        <p className="hint chat-hint">Чат приходит с сайта: клиент пишет из своей записи, история остаётся в карточке.</p>
      </div>
    </>
  );
}
