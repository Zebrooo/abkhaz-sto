import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { serviceContext } from "@/lib/context";
import { initials } from "@/lib/format";
import { masterDay } from "@/lib/master-day";
import { assignMasterAction } from "@/app/(app)/staff-actions";

/**
 * Мастер записи в её карточке: чип «<человек> Леван» среди чипов поста и
 * длительности, по нажатию — шторка «Мастер записи» со списком мастеров.
 * По умолчанию — мастер поста (без привязки запись делает тот, кто на
 * посту стоит); назначенный вручную отмечен галочкой и видит запись у себя
 * в «Мой пост». Мастеров у сервиса нет — чипа нет: выбирать не из кого.
 *
 * Серверный компонент без своего состояния: открыт или нет, решает адрес
 * (`?do=master`), закрывает ссылка на selfHref.
 */
export async function MasterPick({ bookingId, postNo, day, open, selfHref }: {
  bookingId: number;
  postNo: number;
  day: string;
  open: boolean;
  /** Адрес карточки без шторки — сюда возвращаемся и сюда же дописываем ?do=master. */
  selfHref: string;
}) {
  const ctx = await serviceContext();
  if (!ctx) return null;
  const { masters, links } = await masterDay(ctx, day);
  const active = masters.filter(m => m.active);
  if (active.length === 0) return null;

  // Привязка этой записи — из тех же пар, что раскладывает masterDay; без
  // неё действует правило поста.
  const link = links.find(l => l.bookingId === bookingId);
  const current = link ? (active.find(m => m.id === link.masterId) ?? null) : (active.find(m => m.postNo === postNo) ?? null);
  const openHref = `${selfHref}${selfHref.includes("?") ? "&" : "?"}do=master`;

  return (
    <>
      <Link className="rspec" href={openHref} aria-label="Мастер записи">
        <Icon name="user" size={12} />{current ? current.name.trim().split(/\s+/)[0] : "без мастера"}
      </Link>
      {open && (
        <Sheet
          closeHref={selfHref}
          title="Мастер записи"
          sub={`№ ${bookingId} · пост ${postNo}`}
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={selfHref}>Закрыть</Link>}
        >
          <div className="pick-list">
            <p className="sheet-note">По умолчанию — мастер поста. Назначенный вручную видит запись у себя в «Мой пост».</p>
            {active.map(m => {
              const picked = current?.id === m.id;
              return (
                <form key={m.id} action={assignMasterAction}>
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <input type="hidden" name="masterId" value={m.id} />
                  <input type="hidden" name="masterName" value={m.name} />
                  <input type="hidden" name="return" value={selfHref} />
                  <button className={`pick${m.onShift ? "" : " pick-off"}`} type="submit" aria-pressed={picked}>
                    <span className="ava ava-accent">{initials(m.name)}</span>
                    <span className="pick-main">
                      <span className="pick-t">{m.name}</span>
                      <span className="pick-s">{[m.speciality, m.onShift ? "на смене" : "выходной"].filter(Boolean).join(" · ")}</span>
                    </span>
                    {picked && <span className="pick-on"><Icon name="check" size={14} /></span>}
                  </button>
                </form>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
}
