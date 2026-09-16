import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { fetchMastersLoad, type MasterLoad, type StoMaster } from "@/lib/api/masters";
import { listOr } from "@/lib/api/site-api";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { addDays, count, initials, rub, todayLocal } from "@/lib/format";
import { masterDay } from "@/lib/master-day";
import { localTime } from "@/lib/sto/slots";
import { createMasterAction, handoffAction, toggleMasterShiftAction } from "@/app/(app)/staff-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const ADD_FORM = "master-add";
const ID_LIST = /^\d+(,\d+)*$/;

/** «на смене» или «выходной» — подпись мастера в шторке передачи. */
const shiftLabel = (m: StoMaster) => (m.onShift ? "на смене" : "выходной");

/**
 * «Мастера» — кто на смене, на каком посту, сколько окон и денег за
 * сегодня. Переключатель снимает мастера со смены; его записи остаются на
 * посту (lib/api/masters.ts), и их номера сайт возвращает в orphaned —
 * действие несёт их в адрес, экран рисует плашку «остались без мастера» и
 * шторку «Передать». Загрузка — за сегодняшний день, теми же границами,
 * что у сводки денег.
 */
export default async function MastersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("masters"))!;
  const { shop, role } = ctx;
  const day = todayLocal();
  const pending = await countPending(shop.id);
  const { masters } = await masterDay(ctx, day);
  const active = masters.filter(m => m.active);
  const load = active.length
    ? listOr(await fetchMastersLoad({
      shopId: shop.id, actorUserId: ctx.userId,
      from: localTime(day, "00:00").toISOString(), to: localTime(addDays(day, 1), "00:00").toISOString(),
    }))
    : [];
  const loadOf = new Map<number, MasterLoad>(load.map(l => [l.masterId, l]));
  const onShift = active.filter(m => m.onShift).length;
  const subLine = active.length === 0 ? "мастеров пока нет" : `${onShift} на смене из ${active.length}`;

  // Осиротевшие записи — из адреса, куда их положило действие переключателя.
  const orphanOf = Number(pick(sp.m));
  const orphanedRaw = pick(sp.orphaned);
  const orphaned = ID_LIST.test(orphanedRaw) ? orphanedRaw.split(",").map(Number) : [];
  const handoffId = Number(pick(sp.handoff));
  const handoffFrom = active.find(m => m.id === handoffId) ?? null;

  const act = pick(sp.do);
  const posts = shop.schedule?.posts ?? 1;
  const postRaw = Number(pick(sp.post));
  const newPost = Number.isInteger(postRaw) && postRaw >= 1 && postRaw <= posts ? postRaw : 0;
  const addHref = (post: number) => `/mastera?do=add${post ? `&post=${post}` : ""}`;

  return (
    <>
      <ScreenHead title="Мастера" sub={subLine} back="/menu" unread={pending} />
      <div className="page page-masters stack">
        <div className="head">
          <div>
            <div className="head-t">Мастера</div>
            <div className="head-s">Мастер привязан к посту: запись сразу знает, кто её делает. Выключенный мастер не занимает окна.</div>
          </div>
          {role === "owner" && (
            <div className="head-tail">
              <Link className="aui-btn aui-btn--primary aui-btn--md" href={addHref(0)}>Добавить мастера</Link>
            </div>
          )}
        </div>

        <Flash ok={pick(sp.ok)} err={act === "add" && role === "owner" ? "" : pick(sp.err)} />

        {active.length === 0 ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="users" size={26} /></span>
              <div className="empty-t">Мастеров пока нет</div>
              <div className="empty-s">Записи стоят на постах без имени. Добавьте мастера — и запись на его пост сразу покажет, кто её делает.</div>
              {role === "owner" && <Link className="aui-btn aui-btn--primary aui-btn--md" href={addHref(0)}>Добавить мастера</Link>}
            </div>
          </div>
        ) : (
          <div className="m-grid">
            {active.map(m => {
              const l = loadOf.get(m.id);
              const orphans = m.id === orphanOf && !m.onShift ? orphaned : [];
              return (
                <div key={m.id} className="card m-card">
                  <div className="person">
                    <span className="ava ava-accent">{initials(m.name)}</span>
                    <div className="row-main">
                      <div className="person-n">{m.name}</div>
                      <div className="person-s">{m.speciality || "специальность не указана"}</div>
                    </div>
                    <form action={toggleMasterShiftAction}>
                      <input type="hidden" name="masterId" value={m.id} />
                      <input type="hidden" name="onShift" value={m.onShift ? "0" : "1"} />
                      <button className="sw" type="submit" aria-pressed={m.onShift} aria-label={m.onShift ? "Снять со смены" : "Поставить на смену"}>
                        <span />
                      </button>
                    </form>
                  </div>
                  <div className="tiles">
                    <div className="tile"><div className="tile-k">Пост</div><div className="tile-v">{m.postNo ? `Пост ${m.postNo}` : "—"}</div></div>
                    <div className="tile"><div className="tile-k">Окна</div><div className="tile-v">{l ? `${l.busySlots} из ${l.totalSlots}` : "—"}</div></div>
                    <div className="tile"><div className="tile-k">Выручка</div><div className="tile-v">{l ? rub(l.revenue) : "—"}</div></div>
                  </div>
                  {orphans.length > 0 && (
                    <div className="m-orphan">
                      <span>{count(orphans.length, "запись осталась", "записи остались", "записей остались")} без мастера</span>
                      <Link className="aui-btn aui-btn--primary aui-btn--sm" href={`/mastera?handoff=${m.id}&orphaned=${orphans.join(",")}`}>Передать</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="hint m-note">Мастер привязывается к посту: запись на пост 2 сразу показывает, кто её делает. Выключенный мастер не занимает окна.</p>
        {role === "owner" && active.length > 0 && (
          <Link className="aui-btn aui-btn--outline aui-btn--lg m-add" href={addHref(0)}>Добавить мастера</Link>
        )}
      </div>

      {act === "add" && role === "owner" && (
        <Sheet
          closeHref="/mastera"
          title="Новый мастер"
          sub="имя, специальность и пост"
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={ADD_FORM}>Добавить</button>}
        >
          <form id={ADD_FORM} action={createMasterAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <label className="fld">
              <span>Имя</span>
              <input name="name" placeholder="Как зовут мастера" maxLength={80} required autoFocus />
            </label>
            <label className="fld">
              <span>Специальность</span>
              <input name="speciality" placeholder="Двигатель, диагностика" maxLength={80} />
            </label>
            <div className="fld">
              <span>Пост</span>
              {/* Постов больше четырёх — сегмент не влезает, поэтому чипы с переносом. */}
              <div className="chips chips-wrap">
                <Link className="chip" href={addHref(0)} aria-pressed={newPost === 0}>Без поста</Link>
                {Array.from({ length: posts }, (_, i) => i + 1).map(p => (
                  <Link key={p} className="chip" href={addHref(p)} aria-pressed={newPost === p}>Пост {p}</Link>
                ))}
              </div>
            </div>
            <input type="hidden" name="postNo" value={newPost} />
            <p className="sheet-note">Мастер без учётки в приложение не входит, но стоит в расписании и в отчётах. Учётку он получит в «Доступах».</p>
          </form>
        </Sheet>
      )}

      {handoffFrom && orphaned.length > 0 && (
        <Sheet
          closeHref="/mastera"
          title="Передать записи"
          sub={`${count(orphaned.length, "запись", "записи", "записей")} · от ${handoffFrom.name}`}
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href="/mastera">Закрыть</Link>}
        >
          <div className="pick-list">
            <p className="sheet-note">Записи встанут на пост нового мастера — он увидит их у себя в «Мой пост».</p>
            {active.filter(m => m.id !== handoffFrom.id).map(m => (
              <form key={m.id} action={handoffAction}>
                <input type="hidden" name="toMasterId" value={m.id} />
                <input type="hidden" name="bookingIds" value={orphaned.join(",")} />
                <button className={`pick${m.onShift ? "" : " pick-off"}`} type="submit">
                  <span className="ava ava-accent">{initials(m.name)}</span>
                  <span className="pick-main">
                    <span className="pick-t">{m.name}</span>
                    <span className="pick-s">{[m.speciality, shiftLabel(m)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </form>
            ))}
            {active.length < 2 && <p className="hint">Передать некому — других мастеров нет.</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
