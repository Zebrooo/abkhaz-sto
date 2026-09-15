import Link from "next/link";
import { notFound } from "next/navigation";
import { addDefectAction, removeDefectAction, startInspectionAction } from "@/app/(app)/osmotr-actions";
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
import { countPending, getBooking, recentBookings } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { dayTitle, minutesLabel, rub } from "@/lib/format";
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

/** Та же машина, что в записи: по id из гаража или по номеру снимка. */
function sameCar(a: StoBookingRow, b: StoBookingRow): boolean {
  if (a.vehicle_id != null && a.vehicle_id === b.vehicle_id) return true;
  const plate = a.data.vehicle?.plate;
  return !!plate && plate === b.data.vehicle?.plate;
}

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
  const pending = await countPending(shop.id);
  const actor = { shopId: shop.id, actorUserId: ctx.userId };

  const insp = await fetchInspection({ ...actor, bookingId: b.id });
  // not_found — осмотра ещё нет, это нормально; остальное — ошибка на экран.
  const inspection = insp.ok ? insp.data : null;
  const loadErr = !insp.ok && insp.code !== "not_found" ? insp.error : "";

  const car = vehicleLine(b) ?? b.service.title;
  const plate = b.data.vehicle?.plate ?? "без номера";
  const defects: Defect[] = inspection?.defects ?? [];
  const state = inspectionState(defects.length);
  const rest = untouchedNodeKeys(defects).length;

  const act = pick(sp.do);
  const kmOpen = !inspection || act === "km";
  const captureOpen = !!inspection && act === "capture";
  const node = isNodeKey(pick(sp.node)) ? pick(sp.node) : null;
  const presetOpen = !!inspection && act === "preset" && !!node;
  const photoIds = photoIdsFrom(many(sp.photo));

  // Прошлый пробег — только подсказка под полем: сайт всё равно сверит. Ищем
  // прошлую запись той же машины и её осмотр; нет — подписи нет.
  let prev: { day: string; km: number } | null = null;
  if (kmOpen && !inspection) {
    const before = (await recentBookings(shop.id)).find(r => r.id !== b.id && r.starts_at < b.starts_at && sameCar(b, r));
    const pi = before ? await fetchInspection({ ...actor, bookingId: before.id }) : null;
    if (before && pi?.ok) prev = { day: localDay(new Date(before.starts_at)), km: pi.data.odometerKm };
  }

  // Сумму сметы считает сайт — берём её из отчёта, а не складываем цены.
  const [frequent, presets, report] = await Promise.all([
    inspection ? fetchFrequentPresets({ ...actor, limit: 6 }).then(r => listOr(r)) : [],
    presetOpen && node ? fetchPresets({ ...actor, nodeKey: node }).then(r => listOr(r)) : [],
    inspection && defects.length > 0 ? fetchReport({ ...actor, inspectionId: inspection.id }) : null,
  ]);
  const total = report?.ok ? report.data.total : null;
  const starter = isStarterSet(frequent);
  const finishLabel = defects.length === 0 ? "Всё в норме — закрыть осмотр" : total == null ? "Готово · к отчёту" : `Готово · отчёт на ${rub(total)}`;

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
            <div className="head-s">{car} · {plate} · запись № {b.id}{inspection?.masterName ? ` · мастер ${inspection.masterName}` : ""}</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--outline aui-btn--md" href={reportHref}>Отчёт</Link>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={sheetOpen ? loadErr : formErr || loadErr} />

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

            <Link className="ins-cta" href={self("&do=capture")} aria-disabled={!inspection}>
              <span className="sq"><Icon name="camera" size={24} /></span>
              <span className="row-main">
                <span className="ins-cta-t">Снять дефект</span>
                <span className="ins-cta-s">фото, узел, и он уже в отчёте</span>
              </span>
            </Link>

            {inspection && frequent.length > 0 && (
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
                    <form action={removeDefectAction}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="defectId" value={d.id} />
                      <input type="hidden" name="return" value={self()} />
                      <button className="ins-def-x" type="submit" aria-label="Убрать из отчёта">
                        <span><Icon name="plus" size={16} /></span>
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <div className="ins-note">
              Ничего не отмечать не нужно: всё, что не в отчёте, уходит в «проверено и в норме». Остальные {nodesLabel(rest)} закроются одной кнопкой.
            </div>

            <div className="sticky-actions">
              {inspection
                ? <Link className="aui-btn aui-btn--primary aui-btn--lg" href={reportHref}>{finishLabel}</Link>
                : <Link className="aui-btn aui-btn--primary aui-btn--lg" href={self("&do=km")}>Начать с пробега</Link>}
            </div>
          </div>
        </div>
      </div>

      {kmOpen && (
        <Sheet
          closeHref={inspection ? self() : bookingHref}
          title="Пробег сейчас"
          sub={`${car} · ${plate}`}
          footer={inspection
            ? <Link className="aui-btn aui-btn--secondary aui-btn--lg aui-btn--block" href={self()}>Закрыть</Link>
            : <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={KM_FORM}>Сохранить пробег</button>}
        >
          {inspection ? (
            <div className="sheet-stack">
              <div className="km-box"><span className="km-v">{inspection.odometerKm.toLocaleString("ru-RU")}</span><span>км</span></div>
              <div className="sheet-note">Пробег записан в начале осмотра и в отчёте останется таким: между визитами машина ездит, и подставлять другое число нельзя.</div>
            </div>
          ) : (
            <form id={KM_FORM} action={startInspectionAction} className="sheet-stack">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="return" value={self()} />
              {formErr && <Flash err={formErr} />}
              <div className="sheet-note">Один раз за осмотр — пробег попадёт в отчёт и в историю машины.</div>
              <label className="km-box">
                <input name="odometer" inputMode="numeric" autoComplete="off" aria-label="Пробег, км" autoFocus />
                <span>км</span>
              </label>
              {prev && <div className="km-prev">В прошлый визит, {dayTitle(prev.day)} — {kmLabel(prev.km)}</div>}
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
