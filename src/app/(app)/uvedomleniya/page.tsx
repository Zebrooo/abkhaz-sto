import Link from "next/link";
import { countPending, feedBookings } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { buildFeed, groupFeed } from "@/lib/notifications";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { count, relativeAt, timeRange, todayLocal } from "@/lib/format";
import { localDay } from "@/lib/sto/slots";
import { transitionAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const HEAD_SUB = "Новые записи с сайта, отмены клиентом и предоплаты. Подтвердить можно не открывая запись.";

/**
 * Лента событий сервиса. Своей таблицы уведомлений нет: всё, что здесь
 * видно, лежит в самих записях (lib/notifications), поэтому лента всегда
 * сходится с тем, что показывают другие экраны.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Гейт по роли: раздел закрыт — requireSection уводит на первый экран роли.
  const ctx = (await requireSection("shift"))!;
  const shop = ctx.shop;
  // Ленте нужны только записи-события (новые, отмены клиентом, предоплаты) —
  // их и приносит feedBookings, а не вся история сервиса.
  const [rows, pending] = await Promise.all([feedBookings(shop.id), countPending(shop.id)]);
  const groups = groupFeed(buildFeed(rows, timeRange), todayLocal(), localDay);

  return (
    <>
      <ScreenHead title="Уведомления" sub={count(pending, "новая запись", "новые записи", "новых записей")} back="/menu" unread={pending} />
      <div className="page page-feed stack">
        <div className="head">
          <div>
            <div className="head-t">Уведомления</div>
            <div className="head-s">{HEAD_SUB}</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        {groups.length === 0 ? (
          <div className="card empty">
            <span className="sq"><Icon name="bell" size={26} /></span>
            <div className="empty-t">Пока тихо</div>
            <div className="empty-s">Новые записи с сайта, отмены клиентом и зачисленные предоплаты появятся здесь.</div>
          </div>
        ) : (
          groups.map(g => (
            <div key={g.title} className="feed-g">
              <div className="eyebrow">{g.title}</div>
              {g.items.map(n => (
                <div key={n.id} className={`card card-sm${n.accent ? " card-accent" : ""}`}>
                  <div className="notif">
                    <span className={`sq${n.accent ? " sq-accent" : ""}`}><Icon name={n.icon} size={18} /></span>
                    <div className="row-main">
                      <div className="notif-t">{n.title}</div>
                      <div className="notif-s">{n.text}</div>
                    </div>
                    <div className="notif-at">{relativeAt(n.at)}</div>
                    {n.canConfirm && (
                      <div className="notif-actions">
                        <form action={transitionAction}>
                          <input type="hidden" name="shopId" value={shop.id} />
                          <input type="hidden" name="bookingId" value={n.bookingId} />
                          <input type="hidden" name="transition" value="confirm" />
                          <input type="hidden" name="return" value="/uvedomleniya" />
                          <button className="aui-btn aui-btn--primary aui-btn--sm" type="submit">Подтвердить</button>
                        </form>
                        <Link className="aui-btn aui-btn--outline aui-btn--sm" href={`/zapis/${n.bookingId}`}>Открыть запись</Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
