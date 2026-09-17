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
import { createMasterAction, handoffAction, toggleMasterShiftAction, updateMasterAction } from "@/app/(app)/staff-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const ADD_FORM = "master-add";
const EDIT_FORM = "master-edit";
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
  const { masters, mastersErr } = await masterDay(ctx, day);
  const active = masters.filter(m => m.active);
  // Уволенные прячутся, но не исчезают: вернуть человека в штат иначе нечем,
  // а увольнение по ошибке — обычное дело.
  const fired = masters.filter(m => !m.active);
  const showFired = pick(sp.all) === "1";
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

  // Правка мастера — та же шторка, что и «Новый мастер», только с его
  // значениями. Пост живёт в адресе, как и при создании: экран серверный,
  // и выбор чипа — это переход, а не клиентское состояние.
  const editId = Number(pick(sp.edit));
  const editing = masters.find(m => m.id === editId) ?? null;
  const postParam = pick(sp.post);
  const editPost = editing
    ? (postParam === "" ? (editing.postNo ?? 0) : (Number.isInteger(postRaw) && postRaw >= 1 && postRaw <= posts ? postRaw : 0))
    : 0;
  const editHref = (post: number) => `/mastera?edit=${editId}&post=${post}`;
  const listHref = showFired ? "/mastera?all=1" : "/mastera";

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

        <Flash ok={pick(sp.ok)} err={(act === "add" && role === "owner") || editing ? "" : pick(sp.err)} />

        {/* «Мастеров нет» и «мы их не спросили» выглядят одинаково, а делать
            надо разное: в первом случае — завести, во втором — ждать сайт.
            Поэтому отказ называем вслух, как на «Доступах». */}
        {mastersErr && (
          <div className="card card-accent">
            <div className="note-t">Справочник мастеров не загрузился</div>
            <div className="note-s">{mastersErr}. Записи и посты работают, а имена мастеров появятся, когда сайт ответит.</div>
          </div>
        )}

        {active.length === 0 ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="users" size={26} /></span>
              <div className="empty-t">{mastersErr ? "Список пуст, пока сайт молчит" : "Мастеров пока нет"}</div>
              <div className="empty-s">Записи стоят на постах без имени. Добавьте мастера — и запись на его пост сразу покажет, кто её делает.</div>
              {role === "owner" && !mastersErr && <Link className="aui-btn aui-btn--primary aui-btn--md" href={addHref(0)}>Добавить мастера</Link>}
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
                    {/* Правит и админ: раздел ему открыт, и опечатку в имени
                        он исправляет сам. Увольнение внутри — только хозяину. */}
                    <Link className="m-edit" href={`/mastera?edit=${m.id}`} aria-label={`Изменить: ${m.name}`}>
                      <Icon name="edit" size={16} />
                    </Link>
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

        {/* УВОЛЕННЫЕ НЕ ПРОПАДАЮТ НАВСЕГДА. Уволенный мастер исчезает из
            списка, и вернуть его было бы нечем: строкой ниже он находится, а
            в его шторке есть «Вернуть в штат». */}
        {fired.length > 0 && (
          showFired ? (
            <>
              <div className="sect">Уволенные</div>
              <div className="card card-flat">
                {fired.map(m => (
                  <div key={m.id} className="row m-fired">
                    <span className="ava">{initials(m.name)}</span>
                    <div className="row-main">
                      <div className="row-t">{m.name}</div>
                      <div className="row-s">{[m.speciality, "не в штате"].filter(Boolean).join(" · ")}</div>
                    </div>
                    {role === "owner" && (
                      <form action={updateMasterAction}>
                        <input type="hidden" name="masterId" value={m.id} />
                        <input type="hidden" name="fire" value="0" />
                        <button className="aui-btn aui-btn--outline aui-btn--sm" type="submit">Вернуть в штат</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
              <Link className="hint m-fired-link" href="/mastera">Скрыть уволенных</Link>
            </>
          ) : (
            <Link className="hint m-fired-link" href="/mastera?all=1">
              {count(fired.length, "уволенный мастер", "уволенных мастера", "уволенных мастеров")} — показать
            </Link>
          )
        )}

        <p className="hint m-note">Мастер привязывается к посту: запись на пост 2 сразу показывает, кто её делает. Выключенный мастер не занимает окна.</p>
        {/* ЗАВЕСТИ МАСТЕРА И ПУСТИТЬ ЕГО В ПРИЛОЖЕНИЕ — РАЗНЫЕ ДЕЛА, и дорогу
            ко второму ищут здесь, а не в «Доступах»: человек пришёл на экран
            «Мастера», чтобы позвать мастера. */}
        {role === "owner" && (
          <Link className="hint m-invite" href="/dostupy?do=invite&role=master">
            Пустить мастера в приложение по номеру телефона — в «Доступах»
          </Link>
        )}
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
            <p className="sheet-note">
              Это строка справочника: она стоит в расписании и в отчётах, входить в приложение по ней нельзя.
              Чтобы мастер вошёл, пригласите его по номеру телефона в «Доступах» — роль включится, когда он войдёт этим номером.
            </p>
            <Link className="sheet-note m-invite" href="/dostupy?do=invite&role=master">Пригласить по номеру телефона →</Link>
          </form>
        </Sheet>
      )}

      {editing && (
        <Sheet
          closeHref={listHref}
          title={editing.name}
          sub="имя, специальность и пост"
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={EDIT_FORM}>Сохранить</button>}
        >
          <form id={EDIT_FORM} action={updateMasterAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            <input type="hidden" name="masterId" value={editing.id} />
            {/* Прежние значения — чтобы на сайт уехало только изменённое:
                пост мастер ставит себе сам утром, и переписывать его правкой
                имени нельзя (staff-actions.ts). */}
            <input type="hidden" name="wasName" value={editing.name} />
            <input type="hidden" name="wasSpeciality" value={editing.speciality ?? ""} />
            <input type="hidden" name="wasPostNo" value={editing.postNo ?? 0} />
            <label className="fld">
              <span>Имя</span>
              <input name="name" defaultValue={editing.name} maxLength={80} required autoFocus />
            </label>
            <label className="fld">
              <span>Специальность</span>
              <input name="speciality" defaultValue={editing.speciality ?? ""} placeholder="Двигатель, диагностика" maxLength={80} />
            </label>
            <div className="fld">
              <span>Пост</span>
              <div className="chips chips-wrap">
                <Link className="chip" href={editHref(0)} aria-pressed={editPost === 0}>Без поста</Link>
                {Array.from({ length: posts }, (_, i) => i + 1).map(p => (
                  <Link key={p} className="chip" href={editHref(p)} aria-pressed={editPost === p}>Пост {p}</Link>
                ))}
              </div>
            </div>
            <input type="hidden" name="postNo" value={editPost} />
            <p className="sheet-note">Мастер и сам отмечается на подъёмнике, когда приходит на смену. Здесь — закрепление по умолчанию: с него начинается его день.</p>
            {/* Увольнение — в той же шторке, но отдельной кнопкой и внизу:
                это не «сохранить», это другое действие. Записи уволенного
                остаются на постах, их предложат передать. */}
            {role === "owner" && (
              <button className="aui-btn aui-btn--ghost aui-btn--sm m-fire" type="submit" name="fire" value="1">
                Уволить — записи останутся на постах
              </button>
            )}
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
