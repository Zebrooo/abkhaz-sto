import Link from "next/link";
import { notFound } from "next/navigation";
import { reportPdfAction, sendReportAction, toggleItemAction } from "@/app/(app)/osmotr-actions";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ScreenHead } from "@/components/ScreenHead";
import { SEVERITY_LABEL, fetchInspection, type Severity } from "@/lib/api/inspections";
import { fetchReport, REPORT_STATUS_LABEL, type Report } from "@/lib/api/reports";
import { can } from "@/lib/access";
import { countPending, getBooking } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { dayShort, dayTitle, minutesLabel, rub, todayLocal } from "@/lib/format";
import { bySeverity, countBySeverity, kmLabel } from "@/lib/inspection";
import { nodeName } from "@/lib/inspection-nodes";
import { clientKey } from "@/lib/clients";
import { listServices } from "@/lib/services";
import { vehicleKey } from "@/lib/vehicles";
import { localDay, localHHMM } from "@/lib/sto/slots";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const BADGE: Record<Severity, string> = { bad: "aui-badge", warn: "aui-badge is-tag-urgent" };
const priceText = (p: number | null) => (p == null ? "договорная" : rub(p));

/** «15.09.2026, 11:40» — дата осмотра по часам сервиса. */
function stamp(at: string): string {
  const d = new Date(at);
  const day = localDay(d);
  return `${dayShort(day)}.${day.slice(0, 4)}, ${localHHMM(d)}`;
}

/** Общая рамка экрана: шапка телефона, заголовок веба, тело. */
function Frame({ sub, back, unread, children }: { sub: string; back: string; unread: number; children: React.ReactNode }) {
  return (
    <>
      <ScreenHead title="Отчёт по диагностике" sub={sub} back={back} unread={unread} />
      <div className="page stack rp">
        <div className="head">
          <div>
            <div className="head-t">Отчёт по диагностике</div>
            <div className="head-s">{sub}</div>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * Отчёт по диагностике — лицо осмотра для клиента: дефекты с фото и
 * работой, «проверено и в норме», смета. Сумму и список нормы присылает
 * сайт; здесь только галочки сметы (пункт в сумму или нет), запись на
 * работу и передача отчёта дальше — мастер админу, админ клиенту.
 */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
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
  const inspectHref = `/zapis/${b.id}/osmotr?d=${day}`;
  const self = `/zapis/${b.id}/otchet?d=${day}`;
  const pending = await countPending(shop.id);
  const actor = { shopId: shop.id, actorUserId: ctx.userId };
  const sub = `№ Д-${b.id} · ${b.service.title}`;

  const insp = await fetchInspection({ ...actor, bookingId: b.id });
  if (!insp.ok) {
    return (
      <Frame sub={sub} back={inspectHref} unread={pending}>
        {insp.code === "not_found" ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="camera" size={26} /></span>
              <div className="empty-t">Осмотра ещё нет</div>
              <div className="empty-s">Отчёт собирается из осмотра: пробег и найденные дефекты. Всё, чего мастер не коснулся, уйдёт как «в норме».</div>
              <Link className="aui-btn aui-btn--primary aui-btn--md" href={inspectHref}>Начать осмотр</Link>
            </div>
          </div>
        ) : <Flash title="Осмотр не загрузился" err={insp.error} />}
      </Frame>
    );
  }

  const rep = await fetchReport({ ...actor, inspectionId: insp.data.id });
  if (!rep.ok) {
    return (
      <Frame sub={sub} back={inspectHref} unread={pending}>
        {rep.code === "not_found" ? (
          <div className="card">
            <div className="empty">
              <span className="sq"><Icon name="list" size={26} /></span>
              <div className="empty-t">Отчёт ещё не собран</div>
              <div className="empty-s">Смету и список нормы считает сайт по осмотру. Пока его нет — вернитесь к осмотру, дефекты никуда не денутся.</div>
              <Link className="aui-btn aui-btn--secondary aui-btn--md" href={inspectHref}>Открыть осмотр</Link>
            </div>
          </div>
        ) : <Flash title="Отчёт не загрузился" err={rep.error} />}
      </Frame>
    );
  }

  const r: Report = rep.data;
  const items = new Map(r.estimate.map(i => [i.defectId, i]));
  const defects = bySeverity(r.defects);
  const { bad, warn } = countBySeverity(r.defects);
  const included = r.estimate.filter(i => i.included).length;

  // «Записан: 18 сентября, 10:00» — время из самой записи, по ней и придут.
  const bookedIds = r.estimate.map(i => i.nextBookingId).filter((v): v is number => v != null);
  const booked = new Map(
    (await Promise.all(bookedIds.map(async bid => [bid, await getBooking(shop.id, bid)] as const)))
      .filter(([, row]) => row != null)
      .map(([bid, row]) => [bid, `${dayTitle(localDay(new Date(row!.starts_at)))}, ${localHHMM(new Date(row!.starts_at))}`]),
  );
  // Ссылка «Записать на эту работу» ведёт в ручную запись с услугой прайса:
  // работа дефекта — название строки прайса, по нему её и находим. Связь
  // пункта с записью (book-item) ставит createManualAction по этим параметрам
  // и возвращает сюда — «Записан: …» появится у пункта.
  const services = await listServices(shop.id);
  const bookHref = (defectId: number, work: string) => {
    const q = new URLSearchParams({ d: todayLocal(), fromInspection: String(r.inspectionId), defect: String(defectId), fromBooking: String(b.id) });
    const svc = services.find(s => s.title === work);
    if (svc) q.set("s", String(svc.listingId));
    // Клиент и машина — те же, что в этой записи: форма открывается
    // заполненной, а не пустой, и админ не набирает номер заново.
    q.set("client", clientKey(b));
    const carKey = vehicleKey(b.data.vehicle);
    if (carKey) q.set("car", carKey);
    // Возврат — в отчёт, а не в список дня: «Отмена» из формы, открытой
    // отсюда, обязана вернуть туда, откуда её открыли.
    q.set("back", self);
    return `/kalendar/novaya?${q.toString()}`;
  };

  const sendLabel = can(ctx.role, "sendReport") ? "Отправить клиенту" : "Передать администратору";
  // Записать клиента на найденную работу может тот, кто вообще ведёт записи
  // за стойкой: у мастера прав на привязку пункта к записи нет.
  const canBook = can(ctx.role, "closeBooking");
  const pdfErr = pick(sp.pdf);
  const points = r.defects.length === 1 ? "пункта" : "пунктов";

  return (
    <Frame sub={`${r.no} · ${r.car}`} back={inspectHref} unread={pending}>
      {/* Ошибка PDF — карточкой, а не тостом: тост гаснет через 2,7 с, а причину надо прочитать. ok/err/pdf из действий взаимно исключены. */}
      <Flash ok={pick(sp.ok)} err={pick(sp.err) || pdfErr} title={pick(sp.err) ? undefined : "PDF не открылся"} />

      <div className="card">
        <div className="rp-h">
          <span className="eyebrow">Отчёт по диагностике</span>
          {r.status !== "draft" && <span className="rspec is-accent">{REPORT_STATUS_LABEL[r.status]}</span>}
          <span className="rp-no">№ {r.no}</span>
        </div>
        <div className="rp-car">{r.car}</div>
        <div className="rp-grid">
          <div className="tile"><div className="tile-k">Пробег</div><div className="tile-v">{r.odometerKm == null ? "—" : kmLabel(r.odometerKm)}</div></div>
          <div className="tile"><div className="tile-k">Номер</div><div className="tile-v">{r.plate ?? "—"}</div></div>
          <div className="tile"><div className="tile-k">Мастер</div><div className="tile-v">{r.masterName ?? "—"}</div></div>
          <div className="tile"><div className="tile-k">Дата осмотра</div><div className="tile-v">{stamp(r.inspectedAt)}</div></div>
        </div>
        <div className="rp-badges">
          <span className="aui-badge">{bad} критично</span>
          <span className="aui-badge is-tag-urgent">{warn} внимание</span>
          <span className="aui-badge is-tag-free">{r.okNodeKeys.length} норма</span>
        </div>
      </div>

      {defects.map(d => {
        const item = items.get(d.id);
        const on = item?.included ?? true;
        const when = item?.nextBookingId != null ? booked.get(item.nextBookingId) : undefined;
        return (
          <div key={d.id} className={`rp-def is-${d.severity}${on ? "" : " is-off"}`}>
            <div className="ins-meta">
              <span className={BADGE[d.severity]}>{SEVERITY_LABEL[d.severity]}</span>
              <span>{nodeName(d.nodeKey)}</span>
              <form action={toggleItemAction}>
                <input type="hidden" name="bookingId" value={b.id} />
                <input type="hidden" name="inspectionId" value={r.inspectionId} />
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="included" value={on ? "0" : "1"} />
                <input type="hidden" name="return" value={self} />
                <button className="rp-check" type="submit" aria-pressed={on} aria-label={on ? "Исключить из сметы" : "Вернуть в смету"}>
                  {on && <Icon name="check" size={14} />}
                </button>
              </form>
              <span className="rp-incl">{on ? "в смете" : "исключён из сметы"}</span>
            </div>
            <div className="rp-def-t">{d.title}</div>
            {d.note && <div className="rp-note">{d.note}</div>}
            <PhotoUpload bookingId={b.id} defectId={d.id} photos={d.photos} variant="grid" />
            <div className="rp-work">
              <div className="row-main">
                <div className="rp-work-t">{item?.work ?? d.work}</div>
                <div className="rp-work-s">{minutesLabel(item?.durationMin ?? d.durationMin)}</div>
              </div>
              <div className="rp-price">{priceText(item ? item.price : d.price)}</div>
            </div>
            {/* «Записан: …» видно и у исключённого пункта: клиент на работу
                записан, и прятать это вместе с галочкой сметы нельзя. А пустой
                рамки под пунктом быть не должно — у мастера кнопки нет.
                Запись на работу ставит стойка: привязать пункт к записи
                (reports/book-item) мастеру сайт не даст, и кнопка увела бы его
                в форму, из которой вышла бы запись-сирота. */}
            {item?.nextBookingId != null ? (
              <div className="rp-book">
                <span className="rp-booked"><Icon name="check" size={14} />Записан{when ? `: ${when}` : ` · запись № ${item.nextBookingId}`}</span>
              </div>
            ) : on && canBook ? (
              <div className="rp-book">
                <Link className="aui-btn aui-btn--outline aui-btn--sm" href={bookHref(d.id, item?.work ?? d.work)}>Записать на эту работу</Link>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="card card-sm rp-ok">
        <div className="rp-ok-t">Проверено и в норме</div>
        {r.okNodeKeys.length > 0
          ? <div className="rp-chips">{r.okNodeKeys.map(k => <span key={k} className="rspec">{nodeName(k)}</span>)}</div>
          : <div className="card-s">Дефекты найдены во всех узлах.</div>}
      </div>

      <div className="rp-est">
        <div className="rp-est-h">
          <span className="rp-est-t">Смета по отчёту</span>
          <span className="rp-est-c">{included} из {r.defects.length} {points}</span>
        </div>
        <div className="rp-est-row">
          <span className="rp-est-sum">{rub(r.total)}</span>
          <span className="rp-est-time">работы {minutesLabel(r.totalMin)}{r.hasNegotiable ? " · есть договорная" : ""}</span>
        </div>
        <div className="rp-est-note">Цены — строки прайса витрины; «договорная» означает, что цену согласует админ. Клиент одобряет работы по пунктам.</div>
      </div>

      <div className="sticky-actions">
        <form action={sendReportAction}>
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="inspectionId" value={r.inspectionId} />
          <input type="hidden" name="return" value={self} />
          <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit">{sendLabel}</button>
        </form>
        <form action={reportPdfAction}>
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="inspectionId" value={r.inspectionId} />
          <input type="hidden" name="return" value={self} />
          <button className="aui-btn aui-btn--outline aui-btn--lg rp-pdf" type="submit">PDF</button>
        </form>
      </div>
    </Frame>
  );
}
