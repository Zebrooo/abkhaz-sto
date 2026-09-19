import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addDefectAction, finishInspectionAction, removeDefectAction, startInspectionAction, updateOdometerAction,
} from "@/app/(app)/osmotr-actions";
import { vehicleLine } from "@/components/BookingRow";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import {
  fetchFrequentPresets, fetchInspection, fetchPresets, SEVERITY_LABEL, type Defect, type DefectPreset, type Severity,
} from "@/lib/api/inspections";
import { fetchReport } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { countPending, getBooking } from "@/lib/bookings";
import { carBrief } from "@/lib/car-brief";
import { can } from "@/lib/access";
import { requireSection } from "@/lib/context";
import { count, dayTitle, minutesLabel, rub } from "@/lib/format";
import {
  chipTitle, customWorks, inspectionState, isStarterSet, kmLabel, nodesLabel, photoIdsFrom, untouchedNodeKeys,
} from "@/lib/inspection";
import { INSPECTION_NODES, isNodeKey, nodeName } from "@/lib/inspection-nodes";
import { localDay } from "@/lib/sto/slots";
import type { StoBookingRow } from "@/lib/sto/types";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const KM_FORM = "osmotr-km";

/** Бейдж срочности — те же классы, что у площадки: красный и «urgent». */
const BADGE: Record<Severity, string> = { bad: "aui-badge", warn: "aui-badge is-tag-urgent" };

/** null — «договорная»: работы нет в прайсе, цену согласует админ. */
const priceText = (p: number | null) => (p == null ? "договорная" : rub(p));

/** Скрытые поля, которые ждёт addDefectAction от каждой формы шторки. */
function DefectFields({ b, inspectionId, nodeKey, back, photoIds }: { b: StoBookingRow; inspectionId: number; nodeKey: string; back: string; photoIds: string[] }) {
  return (
    <>
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="nodeKey" value={nodeKey} />
      <input type="hidden" name="return" value={back} />
      {photoIds.map(id => <input key={id} type="hidden" name="photo" value={id} />)}
    </>
  );
}

/**
 * Осмотр при приёмке. Главное правило экрана: норму не отмечают — в списке
 * только найденные дефекты, всё остальное уйдёт в отчёт как «проверено и в
 * норме». Цены мастер не назначает: они приезжают вместе с формулировкой из
 * прайса. Шторки (пробег, съёмка, формулировки узла) открываются параметром
 * `do` в адресе; кадры фото уходят сразу при съёмке (PhotoUpload).
 *
 * Пробег обязателен: пока осмотра нет, шторка «Пробег сейчас» открыта
 * поверх экрана и закрывается только в карточку записи.
 */
export default async function InspectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireSection("inspect");
  if (!ctx) return null;
  const { shop } = ctx;
  const { id } = await params;
  const sp = await searchParams;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) notFound();
  const b = await getBooking(shop.id, bookingId);
  if (!b) notFound();

  const day = isDay(pick(sp.d)) ? pick(sp.d) : localDay(new Date(b.starts_at));
  const bookingHref = `/zapis/${b.id}?d=${day}`;
  const reportHref = `/zapis/${b.id}/otchet?d=${day}`;
  const self = (q = "") => `/zapis/${b.id}/osmotr?d=${day}${q}`;
  const actor = { shopId: shop.id, actorUserId: ctx.userId };
  // Колокол и осмотр независимы — одной пачкой; not_found — осмотра ещё нет,
  // это нормально, остальное — ошибка на экран.
  const [pending, insp] = await Promise.all([
    countPending(shop.id),
    fetchInspection({ ...actor, bookingId: b.id }),
  ]);
  const inspection = insp.ok ? insp.data : null;
  const loadErr = !insp.ok && insp.code !== "not_found" ? insp.error : "";

  const car = vehicleLine(b) ?? b.service.title;
  const plate = b.data.vehicle?.plate ?? "без номера";
  const defects: Defect[] = inspection?.defects ?? [];
  const state = inspectionState(defects.length);
  const rest = untouchedNodeKeys(defects).length;

  // Осмотр завершён — дефекты больше не добавляются и не убираются: это и
  // есть смысл кнопки «Завершить».
  const done = inspection?.status === "finished";

  const act = pick(sp.do);
  // Отказ сайта — не «осмотра ещё нет»: шторку пробега с кнопкой, которая
  // гарантированно упадёт, насильно не открываем, а показываем ошибку на экране.
  const kmOpen = act === "km" || (!inspection && !loadErr);
  // У завершённого осмотра дефекты не трогаем — сайт всё равно откажет.
  const captureOpen = !!inspection && !done && act === "capture";
  const node = isNodeKey(pick(sp.node)) ? pick(sp.node) : null;
  const presetOpen = !!inspection && !done && act === "preset" && !!node;
  const photoIds = photoIdsFrom(many(sp.photo));

  // Досье машины — то, ради чего мастеру не нужно ничего вспоминать: была ли
  // она у нас, что делали, какой был пробег и что тогда нашли (lib/car-brief.ts).
  // Идёт в одной пачке с остальными запросами, поэтому экран от него не ждёт.
  // Сумму сметы считает сайт — берём её из отчёта, а не складываем цены.
  const [brief, frequent, presets, report] = await Promise.all([
    carBrief(ctx, b),
    inspection && inspection.status !== "finished" ? fetchFrequentPresets({ ...actor, limit: 6 }).then(r => listOr(r)) : [],
    presetOpen && node ? fetchPresets({ ...actor, nodeKey: node }).then(r => listOr(r)) : [],
    inspection && defects.length > 0 ? fetchReport({ ...actor, inspectionId: inspection.id }) : null,
  ]);
  const prev = brief.prevKm;
  const last = brief.past.visits[0] ?? null;
  // Номер и VIN из самой записи — по ним мастер сверяет, ту ли машину подали.
  const carId = [b.data.vehicle?.plate, b.data.vehicle?.vin ? `VIN ${b.data.vehicle.vin}` : null].filter(Boolean).join(" · ");
  const total = report?.ok ? report.data.total : null;
  const starter = isStarterSet(frequent);
  const finishLabel = done
    ? (total == null ? "К отчёту" : `К отчёту на ${rub(total)}`)
    : defects.length === 0
      ? "Замечаний нет — завершить осмотр"
      : total == null ? "Завершить осмотр" : `Завершить осмотр · ${rub(total)}`;

  // Ошибка формы из шторки должна быть видна в самой шторке: под затемнением
  // карточку «Не сохранилось» никто не прочитает.
  const formErr = pick(sp.err);
  const sheetOpen = kmOpen || captureOpen || presetOpen;

  const presetChip = (inspectionId: number, p: DefectPreset, meta: string) => (
    <form key={p.id} action={addDefectAction}>
      <DefectFields b={b} inspectionId={inspectionId} nodeKey={p.nodeKey} back={self()} photoIds={[]} />
      <input type="hidden" name="presetId" value={p.id} />
      <input type="hidden" name="title" value={p.title} />
      <button className="ins-fchip" type="submit">
        <span className={`ins-dot ${p.severity}`} />
        <span className="ins-fchip-t">{chipTitle(p.title, nodeName(p.nodeKey))}</span>
        <span className="ins-fchip-m">{meta}</span>
      </button>
    </form>
  );

  return (
    <>
      <ScreenHead title="Осмотр" sub={`${car} · ${plate}`} back={bookingHref} unread={pending} />
      <div className="page stack ins">
        <div className="head">
          <div>
            <div className="head-t">Осмотр и отчёт по диагностике</div>
            <div className="head-s">{car} · {plate} · запись № {b.id}</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--outline aui-btn--md" href={reportHref}>Отчёт</Link>
          </div>
        </div>

        {/* Пока открыта шторка, ошибка живёт в ней: карточка под затемнением
            нечитаема, а одна и та же строка дважды выглядит как две беды. */}
        <Flash ok={pick(sp.ok)} err={sheetOpen ? "" : formErr || loadErr} title={formErr ? undefined : "Осмотр не загрузился"} />

        <div className="ins-cols">
          <div className="ins-col">
            <div className="card">
              <div className="thing">
                <span className="sq"><Icon name="car" size={22} /></span>
                <div className="row-main">
                  <div className="thing-n">{car}</div>
                  <div className="thing-s">
                    {plate} ·{" "}
                    <Link className="ins-km" href={self("&do=km")}>
                      пробег {inspection ? kmLabel(inspection.odometerKm) : "—"}<Icon name="edit" size={12} />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="ins-state">
                <div>
                  <div className="ins-state-t">{state.title}</div>
                  <div className="ins-state-s">{state.sub}</div>
                </div>
                {inspection?.masterName && <span className="ins-master">мастер {inspection.masterName}</span>}
              </div>
            </div>

            {/* ЧТО МЫ ЗНАЕМ ОБ ЭТОЙ МАШИНЕ — чтобы мастер у подъёмника ничего
                не вспоминал и никого не переспрашивал. Всё берём из своих
                записей и прошлых осмотров; чего не знаем — о том и пишем, а
                не выдаём молчание за «машина у нас впервые». */}
            {brief.past.key && (
              <div className="card ins-brief">
                <div className="ins-brief-h">
                  <span className="card-t">Что мы знаем об этой машине</span>
                  {/* Карточка машины лежит в разделе «Клиенты», а мастеру он
                      закрыт: ссылка, которая молча уводит его на «Мой пост»,
                      хуже, чем отсутствие ссылки. */}
                  {can(ctx.role, "clients") && (
                    <Link className="ins-brief-more" href={`/mashiny/${brief.past.key}`}>Карточка машины</Link>
                  )}
                </div>
                <div className="ins-brief-rows">
                  {carId && (
                    <div className="ins-brief-r">
                      <span className="ins-brief-k">Номер и VIN</span>
                      <span className="ins-brief-v">{carId}</span>
                    </div>
                  )}
                  <div className="ins-brief-r">
                    <span className="ins-brief-k">История</span>
                    <span className="ins-brief-v">
                      {last
                        ? `${brief.past.done > 0 ? `обслуживали ${count(brief.past.done, "раз", "раза", "раз")}, ` : ""}последний визит ${dayTitle(localDay(new Date(last.starts_at)))} — ${last.service.title.toLowerCase()}`
                        : "у нас впервые"}
                    </span>
                  </div>
                  {prev && (
                    <div className="ins-brief-r">
                      <span className="ins-brief-k">Прошлый пробег</span>
                      <span className="ins-brief-v">{kmLabel(prev.km)} · {dayTitle(prev.day)}</span>
                    </div>
                  )}
                  {brief.garage && (
                    <div className="ins-brief-r">
                      <span className="ins-brief-k">В гараже клиента</span>
                      <span className="ins-brief-v">
                        {[brief.garage.plate, brief.garage.vin && `VIN ${brief.garage.vin}`].filter(Boolean).join(" · ") || "машина заведена на сайте"}
                      </span>
                    </div>
                  )}
                  {brief.past.otherOwners.length > 0 && (
                    <div className="ins-brief-r">
                      <span className="ins-brief-k">Прежний владелец</span>
                      <span className="ins-brief-v">{brief.past.otherOwners.map(o => o.name).join(", ")}</span>
                    </div>
                  )}
                </div>
                {brief.prevDefects.length > 0 && (
                  <div className="ins-brief-def">
                    <div className="ins-brief-k">В прошлый раз нашли — проверьте, что с этим сейчас</div>
                    <div className="ins-brief-chips">
                      {brief.prevDefects.map((d, i) => (
                        <span key={`${d.day}-${i}`} className="ins-brief-chip">
                          <span className={`ins-dot ${d.severity}`} />{d.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {brief.past.byName && (
                  <div className="ins-small">Номера в записи нет: историю берём только по машинам этого клиента — марка, модель и год совпали.</div>
                )}
                {brief.siteDown && (
                  <div className="ins-small">Прошлые осмотры не подгрузились — пробег и замечания могли быть, мы их сейчас не видим.</div>
                )}
              </div>
            )}

            {/* Без осмотра дефект не снять — ведём к пробегу и говорим почему,
                а не гасим ссылку с живым href. */}
            {done ? (
              <div className="ins-cta is-done">
                <span className="sq"><Icon name="check" size={24} /></span>
                <span className="row-main">
                  <span className="ins-cta-t">Осмотр завершён</span>
                  <span className="ins-cta-s">дефекты больше не меняются — дальше отчёт клиенту</span>
                </span>
              </div>
            ) : (
              <Link className="ins-cta" href={inspection ? self("&do=capture") : self("&do=km")}>
                <span className="sq"><Icon name="camera" size={24} /></span>
                <span className="row-main">
                  <span className="ins-cta-t">Снять дефект</span>
                  <span className="ins-cta-s">{inspection ? "фото, узел, и он уже в отчёте" : "сначала пробег — без него осмотра нет"}</span>
                </span>
              </Link>
            )}

            {inspection && !done && frequent.length > 0 && (
              <>
                <div className="ins-freq-h">
                  <span className="eyebrow">{starter ? "Стартовый набор — частое в автосервисах" : "Вы добавляете чаще всего"}</span>
                  <span className="ins-freq-s">{starter ? "ваш счётчик появится после первых отчётов" : "счётчик по вашим отчётам за 90 дней"}</span>
                </div>
                <div className="ins-freq">
                  {frequent.map(p => presetChip(inspection.id, p, starter ? priceText(p.price) : `${priceText(p.price)} · ×${p.uses}`))}
                </div>
              </>
            )}
          </div>

          <div className="ins-col">
            {defects.length > 0 && (
              <div className="stack">
                <div className="ins-sect">
                  <span>В отчёте</span>
                  {total != null && <span className="ins-sect-s">{rub(total)}</span>}
                </div>
                {defects.map(d => (
                  <div key={d.id} className={`ins-def is-${d.severity}`}>
                    <PhotoUpload bookingId={b.id} defectId={d.id} photos={d.photos} variant="slot" />
                    <div className="row-main">
                      <div className="ins-meta">
                        <span className={BADGE[d.severity]}>{SEVERITY_LABEL[d.severity]}</span>
                        <span>{nodeName(d.nodeKey)}</span>
                      </div>
                      <div className="ins-def-t">{d.title}</div>
                      <div className="ins-def-s">{d.work} · {priceText(d.price)}</div>
                    </div>
                    {!done && (
                      <form action={removeDefectAction}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <input type="hidden" name="defectId" value={d.id} />
                        <input type="hidden" name="return" value={self()} />
                        <button className="ins-def-x" type="submit" aria-label="Убрать из отчёта">
                          <span><Icon name="plus" size={16} /></span>
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="ins-note">
              Ничего не отмечать не нужно: всё, что не в отчёте, уходит в «проверено и в норме». Остальные {nodesLabel(rest)} закроются одной кнопкой.
            </div>

            <div className="sticky-actions ins-finish">
              {!inspection ? (
                <Link className="aui-btn aui-btn--primary aui-btn--lg" href={self("&do=km")}>Начать с пробега</Link>
              ) : done ? (
                // Осмотр закрыт: дефекты больше не меняются, остаётся отчёт.
                <Link className="aui-btn aui-btn--primary aui-btn--lg" href={reportHref}>{finishLabel}</Link>
              ) : (
                <>
                  {/* ЗАВЕРШИТЬ — ОТДЕЛЬНОЕ ДЕЙСТВИЕ, а не «само закроется при
                      отправке отчёта»: мастер сам говорит, что обошёл машину
                      целиком, и после этого список дефектов застывает. */}
                  <form action={finishInspectionAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="inspectionId" value={inspection.id} />
                    <input type="hidden" name="return" value={self()} />
                    <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit">{finishLabel}</button>
                  </form>
                  <Link className="aui-btn aui-btn--outline aui-btn--lg" href={reportHref}>Посмотреть отчёт</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {kmOpen && (
        <Sheet
          closeHref={inspection ? self() : bookingHref}
          title="Пробег сейчас"
          sub={`${car} · ${plate}`}
          footer={inspection && done
            ? <Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Закрыть</Link>
            : <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={KM_FORM}>
              {inspection ? "Исправить пробег" : "Сохранить пробег"}
            </button>}
        >
          {inspection && done ? (
            <div className="sheet-stack">
              <div className="km-box"><span className="km-v">{inspection.odometerKm.toLocaleString("ru-RU")}</span><span>км</span></div>
              <div className="sheet-note">Осмотр завершён — пробег в нём уже не меняется. Если цифра неверная, отчёт придётся собирать заново: клиент читает именно её.</div>
            </div>
          ) : inspection ? (
            // ОШИБИТЬСЯ В ПРОБЕГЕ НА ПРИЁМКЕ ЛЕГКО, а цифра уезжает клиенту в
            // отчёт и в историю машины. Пока осмотр не завершён — правим.
            <form id={KM_FORM} action={updateOdometerAction} className="sheet-stack">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <input type="hidden" name="return" value={self()} />
              {formErr && <Flash err={formErr} />}
              <label className="km-box">
                <input
                  name="odometer"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Пробег, км"
                  defaultValue={inspection.odometerKm}
                />
                <span>км</span>
              </label>
              <div className="sheet-note">Пробег записан в начале осмотра. Исправить можно, пока осмотр не завершён — сайт запомнит, кто и когда поправил.</div>
              {prev && <div className="km-prev">В прошлый визит, {dayTitle(prev.day)} — {kmLabel(prev.km)}</div>}
            </form>
          ) : (
            <form id={KM_FORM} action={startInspectionAction} className="sheet-stack">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="return" value={self()} />
              {(formErr || loadErr) && <Flash err={formErr || loadErr} title={formErr ? undefined : "Осмотр не загрузился"} />}
              <div className="sheet-note">Один раз за осмотр — пробег попадёт в отчёт и в историю машины. С этого же начинается приёмка: машина станет вашей в списке работ.</div>
              <label className="km-box">
                <input name="odometer" inputMode="numeric" autoComplete="off" aria-label="Пробег, км" autoFocus />
                <span>км</span>
              </label>
              {/* Подсказка под полем — только правда: прошлый пробег, «не
                  подгрузилось» или «первый раз». Пустая строка здесь читается
                  как «истории нет», а это не одно и то же. */}
              {prev
                ? <div className="km-prev">В прошлый визит, {dayTitle(prev.day)} — {kmLabel(prev.km)}</div>
                : brief.siteDown
                  ? <div className="km-prev">Прошлый пробег не подгрузился — вводите то, что на панели.</div>
                  : brief.past.byName
                    ? <div className="km-prev">Машина без номера — прошлый пробег по ней не показываем.</div>
                    : last
                      ? <div className="km-prev">Машина у нас была, но осмотров с пробегом по ней нет.</div>
                      : <div className="km-prev">Эта машина у нас впервые.</div>}
            </form>
          )}
        </Sheet>
      )}

      {captureOpen && (
        <Sheet
          closeHref={self()}
          title="Новый дефект"
          sub="снимок и узел — два тапа"
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Отмена</Link>}
        >
          {/* Обычная GET-форма: плитка узла — кнопка, и загруженные кадры
              (скрытые поля PhotoUpload) уезжают в адрес шторки формулировок. */}
          <form method="get" action={`/zapis/${b.id}/osmotr`} className="sheet-stack">
            <input type="hidden" name="d" value={day} />
            <input type="hidden" name="do" value="preset" />
            <PhotoUpload bookingId={b.id} variant="capture" />
            <div className="ins-small">Кадры уходят на сервер сразу при съёмке. Нет связи — у дефекта появится плашка «не ушло» с повтором.</div>
            <div>
              <div className="nb-l">Какой узел — дальше выберете дефект</div>
              <div className="cap-nodes">
                {INSPECTION_NODES.map(n => (
                  <button key={n.key} className="cap-node" type="submit" name="node" value={n.key}>
                    <span className="sq"><Icon name={n.icon} size={20} /></span>
                    <span>{n.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </form>
        </Sheet>
      )}

      {presetOpen && node && inspection && (
        <Sheet
          closeHref={self()}
          backHref={self("&do=capture")}
          title={nodeName(node)}
          sub="тап — и он в отчёте"
          footer={<Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self("&do=capture")}>Другой узел</Link>}
        >
          <div className="sheet-stack">
            {formErr && <Flash err={formErr} />}
            <div className="sheet-note">Каталог узла «{nodeName(node)}» плюс формулировки вашего сервиса. Работа и цена — строки прайса витрины, мастер их не выдумывает.</div>
            {photoIds.length > 0 && <div className="ins-small">{photoIds.length === 1 ? "Кадр ушёл" : `Кадров ушло: ${photoIds.length}`} — он прикрепится к дефекту.</div>}
            {presets.map(p => (
              <form key={p.id} action={addDefectAction}>
                <DefectFields b={b} inspectionId={inspection.id} nodeKey={node} back={self()} photoIds={photoIds} />
                <input type="hidden" name="presetId" value={p.id} />
                <input type="hidden" name="title" value={p.title} />
                <button className="pre" type="submit">
                  <span className={`ins-dot lg ${p.severity}`} />
                  <span className="pre-main">
                    <span className="pre-t">{p.title}</span>
                    <span className="pre-s">{p.work} · {minutesLabel(p.durationMin)} · {p.own ? "ваша формулировка" : "прайс"}</span>
                  </span>
                  <span className="pre-p">{priceText(p.price)}</span>
                </button>
              </form>
            ))}
            {presets.length === 0 && <div className="sheet-note">В каталоге узла пока пусто — опишите дефект своими словами, и он станет первым пунктом.</div>}

            <form action={addDefectAction} className="cust">
              <DefectFields b={b} inspectionId={inspection.id} nodeKey={node} back={self()} photoIds={photoIds} />
              <div className="cust-t">Нет в списке — своими словами</div>
              <input name="title" placeholder="Например: гудит подшипник ступицы справа" maxLength={200} required />
              <div className="seg rseg">
                <label><input type="radio" name="severity" value="warn" defaultChecked />Внимание</label>
                <label><input type="radio" name="severity" value="bad" />Критично</label>
              </div>
              <div className="rchips">
                {customWorks(presets).map((w, i) => (
                  <label key={w.work} className="chip">
                    <input type="radio" name="work" value={w.work} defaultChecked={i === 0} />
                    {w.price == null ? w.work : `${w.work} · ${rub(w.price)}`}
                  </label>
                ))}
              </div>
              <button className="aui-btn aui-btn--primary aui-btn--md" type="submit">Добавить в отчёт</button>
              <div className="cust-note">Формулировка сохранится в каталог узла — в следующий раз будет в списке и в счётчике частых.</div>
            </form>
          </div>
        </Sheet>
      )}
    </>
  );
}
