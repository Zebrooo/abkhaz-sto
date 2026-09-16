import Link from "next/link";
import { notFound } from "next/navigation";
import { sendMessageAction } from "@/app/(app)/chat-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { StatusBadge } from "@/components/Status";
import { fetchMessages, fetchThreads } from "@/lib/api/chat";
import { countPending, getBooking } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { dayShort, formatPhone, initials, relativeAt } from "@/lib/format";
import { localDay, localHHMM } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Готовые ответы за стойкой — те, что пишут чаще всего; тап подставляет текст в поле. */
const QUICK = ["Можем принять в 14:00", "Подтверждаю запись", "Нужна предоплата 500 ₽"];

/** Сколько сообщений тянем: переписка по одной записи короче, дальше клиент звонит. */
const LIMIT = 100;

/** Время пузыря: сегодня — часы, раньше — с датой, иначе «10:15» вчера читается как сегодня. */
function bubbleTime(at: string, today: string): string {
  const d = new Date(at);
  const day = localDay(d);
  return day === today ? localHHMM(d) : `${dayShort(day)}, ${localHHMM(d)}`;
}

/**
 * Переписка с клиентом. Сверху — карточка записи, по которой идёт разговор,
 * ниже пузыри, быстрые ответы и поле. Быстрый ответ — ссылка с ?q=: текст
 * подставляется в поле без клиентского кода. Пока сайт не принимает
 * отправку из приложения (not_found), форма прячется и остаётся переход на
 * сайт по threadUrl — честнее формы, которая молча не доставит.
 */
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = (await requireSection("chat"))!;
  const { shop } = ctx;

  const [threadsRes, msgsRes, pending] = await Promise.all([
    fetchThreads(shop.id, ctx.userId),
    fetchMessages({ shopId: shop.id, actorUserId: ctx.userId, threadId: id, limit: LIMIT }),
    countPending(shop.id),
  ]);
  // Сайт не ответил — это не «треда нет», а «сайт молчит»: 404 здесь соврал
  // бы. Список на /chat в том же случае говорит словами — и мы говорим.
  if (!threadsRes.ok && threadsRes.code !== "not_found") {
    return (
      <>
        <ScreenHead title="Чат" back="/chat" unread={pending} />
        <div className="page stack">
          <Flash err={`Сайт пока не отдаёт чат: ${threadsRes.error}`} title="Сайт не ответил" />
          <Link className="aui-btn aui-btn--outline aui-btn--md" href="/chat">К диалогам</Link>
        </div>
      </>
    );
  }
  const threads = threadsRes.ok ? threadsRes.data : [];
  const thread = threads.find(t => t.id === id);
  if (!thread) notFound();
  const messages = msgsRes.ok ? msgsRes.data : [];
  const booking = thread.bookingId ? await getBooking(shop.id, thread.bookingId) : null;

  const self = `/chat/${encodeURIComponent(id)}`;
  const q = pick(sp.q);
  const noSend = pick(sp.nosend) === "1";
  const today = localDay(new Date());
  const bookingLine = booking ? `${booking.service.title} · пост ${booking.post_no}` : "";

  return (
    <>
      <ScreenHead
        title={thread.clientName}
        sub={thread.bookingId ? `по записи № ${thread.bookingId}` : "по объявлению"}
        back="/chat"
        unread={pending}
      />
      <div className="page chat-page thread-page">
        <div className="chat-wrap">
          <div className="chat-list card card-flat">
            {threads.map(t => (
              <Link key={t.id} className="row chat-row" href={`/chat/${encodeURIComponent(t.id)}`} aria-current={t.id === id ? "page" : undefined}>
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
          </div>

          <div className="chat-pane">
            <div className="thread-head">
              <div className="row-main">
                <div className="thread-n">{thread.clientName}</div>
                <div className="thread-s">
                  {thread.clientPhone ? `${formatPhone(thread.clientPhone)} · ` : ""}
                  {booking ? `запись № ${booking.id}, ${localHHMM(new Date(booking.starts_at))}` : "по объявлению"}
                </div>
              </div>
              {booking && <Link className="aui-btn aui-btn--outline aui-btn--sm" href={`/zapis/${booking.id}`}>Открыть запись</Link>}
              {thread.clientPhone && <a className="aui-btn aui-btn--secondary aui-btn--sm" href={`tel:${thread.clientPhone}`}>Позвонить</a>}
            </div>

            <div className="thread-body stack">
              {booking && (
                <Link className="card card-sm thread-bk" href={`/zapis/${booking.id}`}>
                  <span className="mono thread-bk-t">{localHHMM(new Date(booking.starts_at))}</span>
                  <span className="thread-bk-s">{bookingLine}</span>
                  <StatusBadge status={booking.status} />
                </Link>
              )}

              <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

              <div className="msgs">
                {messages.map(m => (
                  <div key={m.id} className={m.mine ? "msg mine" : "msg"}>
                    <div className="bubble">
                      <div className="bubble-t">{m.text}</div>
                      <div className="bubble-at">{bubbleTime(m.at, today)}</div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="empty">
                    <span className="sq"><Icon name="comment" size={26} /></span>
                    <div className="empty-t">{msgsRes.ok || msgsRes.code === "not_found" ? "Сообщений пока нет" : "Сайт пока не отдаёт переписку"}</div>
                    <div className="empty-s">{msgsRes.ok || msgsRes.code === "not_found" ? "Клиент напишет из своей записи на сайте." : msgsRes.error}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="thread-foot">
              {noSend ? (
                <div className="nosend">
                  <div className="note-s">Сайт пока не принимает сообщения из приложения — ответьте клиенту на сайте, переписка та же.</div>
                  {q && <div className="nosend-q">«{q}»</div>}
                  <a className="aui-btn aui-btn--primary aui-btn--md" href={thread.threadUrl} target="_blank" rel="noreferrer">
                    Ответить на сайте <Icon name="arrowRight" size={16} />
                  </a>
                </div>
              ) : (
                <>
                  <div className="chips quick">
                    {QUICK.map(t => (
                      <Link key={t} className="chip" href={`${self}?q=${encodeURIComponent(t)}`} aria-pressed={t === q}>{t}</Link>
                    ))}
                  </div>
                  <form className="chat-form" action={sendMessageAction}>
                    <input type="hidden" name="threadId" value={id} />
                    {/* key — чтобы быстрый ответ подменил набранное: defaultValue сам по себе живой узел не трогает. */}
                    <input key={q} className="chat-input" name="text" placeholder="Сообщение" defaultValue={q} maxLength={2000} autoComplete="off" required aria-label="Сообщение" />
                    <button className="chat-send" type="submit" aria-label="Отправить">
                      <Icon name="arrowRight" size={20} className="chat-send-i" />
                      <span className="chat-send-t">Отправить</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
