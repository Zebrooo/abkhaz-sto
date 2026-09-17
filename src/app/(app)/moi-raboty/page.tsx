import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { fetchReports, REPORT_STATUS_LABEL } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { clientName, vehicleLine } from "@/components/BookingRow";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { addDays, count, initials, minutesLabel, shortName, timeRange, todayLocal } from "@/lib/format";
import { masterDay } from "@/lib/master-day";
import { busyMinutes, jobNow, jobsAfter, jobsDue, minutesLeft, postCount } from "@/lib/mywork";
import { leavePostAction, takePostAction, updateMyMasterAction } from "@/app/(app)/post-actions";
import { REPORT_BADGE } from "@/lib/reports";
import { dayWindow } from "@/lib/stats";
import { localHHMM, localTime } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";
import { transitionAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** «Рустам А. · Nissan X-Trail 2016 · АГ 550 01» — кто и на чём. */
function carLine(b: StoBookingRow): string {
  return [shortName(clientName(b)), vehicleLine(b), b.data.vehicle?.plate].filter(Boolean).join(" · ");
}

const durationMin = (b: StoBookingRow) =>
  Math.max(0, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000));

/**
 * «Мой пост» — смена глазами мастера: где он стоит, что в работе прямо
 * сейчас (с «осталось N мин»), какая машина подошла по времени, что дальше
 * и отчёты за смену. Ни выручки, ни настроек.
 *
 * НАЧИНАЕТСЯ ВСЁ С ОТМЕТКИ. Пока человек не сказал, какой подъёмник занял,
 * экран не знает, чьи записи показывать, и честно просит отметиться, а не
 * делает вид, что работы нет. Двое мастеров на разных постах отмечаются
 * каждый со своего телефона и видят каждый своё — отметка живёт на
 * устройстве (lib/post-cookie.ts).
 *
 * Строка мастера в справочнике сайта тут не обязательна: пока сайт не отдаёт
 * /masters, её нет ни у кого, а работать надо сегодня. Без неё не будет
 * только имени в отчёте — об этом и говорит приписка.
 */
export default async function MyWorkPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("bookings"))!;
  const { shop } = ctx;
  const pending = await countPending(shop.id);

  const day = todayLocal();
  const now = new Date();
  const { me, mine, rows, masters, hold, postNo } = await masterDay(ctx, day);
  const posts = postCount(shop.schedule?.posts, rows);
  // Кто ещё занял подъёмники — подпись на чипах; справочник молчит, пока
  // сайта нет, и тогда чипы просто номера.
  const takenBy = new Map<number, string>();
  for (const m of masters) {
    if (m.postNo && m.onShift && m.id !== ctx.masterId) takenBy.set(m.postNo, m.name);
  }
  // Машины, которые подошли по времени и ещё не приняты: принятой считаем ту,
  // по которой этот человек уже начал осмотр (отметка на устройстве).
  const due = jobsDue(mine, now).filter(b => !hold?.accepted.includes(b.id));
  const reports = listOr(await fetchReports({
    shopId: shop.id, actorUserId: ctx.userId, masterId: ctx.masterId ?? undefined,
    from: localTime(day, "00:00").toISOString(), to: localTime(addDays(day, 1), "00:00").toISOString(),
  }));
  const current = jobNow(mine, now);
  const next = jobsAfter(mine, now);
  const win = dayWindow(shop.schedule, day);
  const shiftLine = win.off ? "сегодня выходной" : `смена до ${hhmm(win.toMin)}`;

  const name = me?.name ?? "Мастер";
  // Пост берём из отметки, а не из справочника: справочник мастеру закрыт, и
  // после «занял подъёмник 2» экран не должен продолжать писать «без поста».
  const postLabel = postNo ? `пост ${postNo}` : "подъёмник не выбран";
  const since = hold?.marks.length ? hold.marks[hold.marks.length - 1].at : null;
  // В шапке телефона — только имя: «Пост 2 · Леван», фамилия не влезает.
  const title = postNo ? `Пост ${postNo}${me ? ` · ${me.name.trim().split(/\s+/)[0]}` : ""}` : "Мой пост";
  const self = "/moi-raboty";
  // «Моя карточка» — единственное место, где мастер правит себя: раздел
  // «Мастера» ему закрыт (там чужие люди и выручка). Пост в шторке живёт в
  // адресе, как и на экране «Мастера»: экран серверный.
  const meOpen = pick(sp.do) === "me" && me !== null;
  const mePostRaw = Number(pick(sp.post));
  const mePost = pick(sp.post) === ""
    ? (me?.postNo ?? 0)
    : (Number.isInteger(mePostRaw) && mePostRaw >= 1 && mePostRaw <= posts ? mePostRaw : 0);
  const ME_FORM = "my-master";

  return (
    <>
      <ScreenHead title={title} sub={shiftLine} unread={pending} />
      <div className="page page-narrow stack">
        <div className="head">
          <div>
            <div className="head-t">Мой пост</div>
            <div className="head-s">{name} · {postLabel} · {shiftLine}</div>
          </div>
        </div>

        {/* Пока открыта шторка, ошибка живёт в ней: одна и та же строка дважды
            выглядит как две беды. */}
        <Flash ok={pick(sp.ok)} err={meOpen ? "" : pick(sp.err)} />

        <div className="mw-hero">
          <div className="person">
            <span className="ava">{initials(name)}</span>
            <div className="row-main">
              <div className="person-n">{name}</div>
              <div className="person-s">{[postLabel, me?.speciality?.toLowerCase()].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="mw-shift">{me && !me.onShift ? "выходной" : "на смене"}</span>
          </div>
          <div className="tiles">
            <div className="tile"><div className="tile-k">Сегодня</div><div className="tile-v">{count(mine.length, "запись", "записи", "записей")}</div></div>
            <div className="tile"><div className="tile-k">Занято</div><div className="tile-v">{minutesLabel(busyMinutes(mine))}</div></div>
            <div className="tile"><div className="tile-k">Отчётов</div><div className="tile-v">{reports.length}</div></div>
          </div>
        </div>

        <div className="card mw-post">
          <div className="card-t">Я на подъёмнике</div>
          <div className="card-s">
            {postNo
              ? `Пост ${postNo}${since ? ` · с ${since}` : ""} — записи этого поста ниже. Перешли на другой? Нажмите его номер.`
              : "Отметьтесь, какой подъёмник заняли, — и записи этого поста появятся ниже."}
          </div>
          <div className="chips mw-posts">
            {Array.from({ length: posts }, (_, i) => i + 1).map(p => (
              <form key={p} action={takePostAction}>
                <input type="hidden" name="postNo" value={p} />
                <button className="chip" type="submit" aria-pressed={p === postNo}>
                  Пост {p}{takenBy.has(p) ? ` · ${shortName(takenBy.get(p)!)}` : ""}
                </button>
              </form>
            ))}
          </div>
          {postNo && (
            <div className="note-b">
              <form action={leavePostAction}>
                <button className="aui-btn aui-btn--outline aui-btn--sm" type="submit">Уйти со смены</button>
              </form>
            </div>
          )}
          {me ? (
            <div className="note-b">
              <Link className="aui-btn aui-btn--outline aui-btn--sm" href={`${self}?do=me`}>Моя карточка</Link>
            </div>
          ) : (
            <p className="hint">
              Учётка не привязана к мастеру: отметка живёт на этом телефоне, а в отчёте не будет имени.
              Привязку учётки к мастеру сайт пока не отдаёт — попросили.
            </p>
          )}
        </div>

        {due.length > 0 && (
          <>
            <div className="sect mw-sect">Машина подошла по времени</div>
            {due.map(b => (
              <div key={b.id} className="card card-accent mw-due">
                <div className="mw-now-head">
                  <span className="mono mw-time">{timeRange(b.starts_at, b.ends_at)}</span>
                  <span className="rspec is-accent">пост {b.post_no}</span>
                </div>
                <div className="mw-now-t">{b.service.title}</div>
                <div className="mw-now-s">{carLine(b)}</div>
                <div className="mw-now-actions">
                  {/* «Принять» — это начать осмотр: шторка пробега откроется
                      сама, потому что осмотра ещё нет. Адрес без do=km, чтобы
                      не пробивать защиту «сайт не ответил». */}
                  <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/zapis/${b.id}/osmotr?d=${day}`}>
                    <Icon name="camera" size={17} />Принять машину
                  </Link>
                  <Link className="aui-btn aui-btn--outline aui-btn--md" href={`/zapis/${b.id}?d=${day}`}>Запись</Link>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="sect mw-sect">Сейчас в работе</div>
        {current ? (
          <div className="card card-accent mw-now">
            <div className="mw-now-head">
              <span className="mono mw-time">{timeRange(current.starts_at, current.ends_at)}</span>
              <span className="rspec is-accent">пост {current.post_no}</span>
              <span className="mono mw-left">осталось {minutesLeft(current.ends_at, now)} мин</span>
            </div>
            <div className="mw-now-t">{current.service.title}</div>
            <div className="mw-now-s">{carLine(current)}</div>
            <div className="mw-now-actions">
              <Link className="aui-btn aui-btn--primary aui-btn--md" href={`/zapis/${current.id}/osmotr`}>
                <Icon name="camera" size={17} />Осмотр
              </Link>
              {current.status === "confirmed" && (
                <form action={transitionAction}>
                  <input type="hidden" name="shopId" value={shop.id} />
                  <input type="hidden" name="bookingId" value={current.id} />
                  <input type="hidden" name="transition" value="done" />
                  <input type="hidden" name="return" value={self} />
                  <button className="aui-btn aui-btn--outline aui-btn--md" type="submit">Готово</button>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="note-t">{postNo ? "Пост свободен" : "Подъёмник не выбран"}</div>
            <div className="note-s">
              {!postNo
                ? "Нажмите номер подъёмника выше — экран наполнится записями этого поста."
                : next.length > 0
                  ? `Следующая запись в ${localHHMM(new Date(next[0].starts_at))} — ${next[0].service.title.toLowerCase()}.`
                  : mine.length > 0 ? "На сегодня работы закончились." : "На сегодня записей на вашем посту нет."}
            </div>
          </div>
        )}

        <div className="sect mw-sect">Дальше на моём посту</div>
        <div className="card card-flat">
          {next.map(b => (
            <Link key={b.id} className="row" href={`/zapis/${b.id}?d=${day}`}>
              <span className="mono row-at">{localHHMM(new Date(b.starts_at))}</span>
              <div className="row-main">
                <div className="row-t">{b.service.title}</div>
                <div className="row-s">{[vehicleLine(b), shortName(clientName(b))].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="rspec">{minutesLabel(durationMin(b))}</span>
            </Link>
          ))}
          {next.length === 0 && <div className="row"><div className="row-s">Дальше записей нет</div></div>}
        </div>

        <div className="card card-sm mw-reports">
          <div className="card-t">Отчёты за смену</div>
          <div className="mw-report-list">
            {reports.map(r => (
              <Link key={r.inspectionId} className="mw-report" href={`/zapis/${r.bookingId}/otchet`}>
                <span className="mono mw-report-no">{r.no}</span>
                <span className="mw-report-car">{r.car}</span>
                <span className={REPORT_BADGE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</span>
              </Link>
            ))}
            {reports.length === 0 && <div className="card-s">Отчётов за смену пока нет — они появятся после осмотра.</div>}
          </div>
          {/* За прошлые дни — отдельный экран: здесь только сегодняшняя смена. */}
          <div className="note-b">
            <Link className="aui-btn aui-btn--outline aui-btn--sm" href="/otchety">Все отчёты</Link>
          </div>
        </div>
      </div>

      {meOpen && me && (
        <Sheet
          closeHref={self}
          title="Моя карточка"
          sub="имя, специальность и подъёмник по умолчанию"
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={ME_FORM}>Сохранить</button>}
        >
          <form id={ME_FORM} action={updateMyMasterAction} className="sheet-stack">
            {pick(sp.err) && <Flash err={pick(sp.err)} />}
            {/* Прежние значения — чтобы на сайт уехало только изменённое. */}
            <input type="hidden" name="wasName" value={me.name} />
            <input type="hidden" name="wasSpeciality" value={me.speciality ?? ""} />
            <input type="hidden" name="wasPostNo" value={me.postNo ?? 0} />
            <label className="fld">
              <span>Имя</span>
              <input name="name" defaultValue={me.name} maxLength={80} required autoFocus />
            </label>
            <label className="fld">
              <span>Специальность</span>
              <input name="speciality" defaultValue={me.speciality ?? ""} placeholder="Двигатель, диагностика" maxLength={80} />
            </label>
            <div className="fld">
              <span>Подъёмник по умолчанию</span>
              {/* Радиокнопки: выбор не уводит со страницы и не стирает имя. */}
              <div className="rchips">
                <label className="chip"><input type="radio" name="postNo" value="0" defaultChecked={mePost === 0} />Без поста</label>
                {Array.from({ length: posts }, (_, i) => i + 1).map(p => (
                  <label key={p} className="chip">
                    <input type="radio" name="postNo" value={p} defaultChecked={mePost === p} />Пост {p}
                  </label>
                ))}
              </div>
            </div>
            <p className="sheet-note">С этого поста начинается ваш день. Когда вы отмечаетесь на подъёмнике кнопкой выше, закрепление обновляется само.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
