import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { SLOT_WARNING_LABEL, type SlotWarning } from "@/lib/slot-warnings";
import { rescheduleAction } from "@/app/(app)/actions";

/**
 * Шторка «перенести всё равно?». Сервер отказал переносу предупреждением и
 * вернул его контекст в адресе (warn, wb, wt, wp — back() в actions.ts);
 * экран рисует шторку, и подтверждение уходит НОВОЙ маленькой формой с
 * force=1 — исходная форма переноса (сетка, список окон) к этому моменту
 * уже умерла вместе с навигацией.
 */
export function moveWarnFromQuery(sp: Record<string, string | string[] | undefined>) {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const warns = pick(sp.warn).split(",").filter((w): w is SlotWarning => w === "past" || w === "closed" || w === "taken" || w === "buffer");
  const bookingId = Number(pick(sp.wb));
  const hhmm = pick(sp.wt);
  const postRaw = Number(pick(sp.wp));
  if (warns.length === 0 || !Number.isInteger(bookingId) || bookingId <= 0 || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return { bookingId, hhmm, postNo: Number.isInteger(postRaw) && postRaw > 0 ? postRaw : undefined, warns };
}

export function MoveConfirmSheet({ shopId, bookingId, day, hhmm, postNo, warns, conflicts, closeHref, returnTo }: {
  shopId: number;
  bookingId: number;
  day: string;
  hhmm: string;
  postNo?: number;
  warns: SlotWarning[];
  /** С кем пересекаемся — время уже готовой строкой. */
  conflicts: { at: string; postNo: number }[];
  closeHref: string;
  returnTo: string;
}) {
  return (
    <Sheet closeHref={closeHref} title="Перенести всё равно?" sub={`${day}, ${hhmm}${postNo ? ` · пост ${postNo}` : ""}`} footer={
      <>
        <Link className="aui-btn aui-btn--outline aui-btn--md" href={closeHref}>Отмена</Link>
        <form action={rescheduleAction} style={{ display: "contents" }}>
          <input type="hidden" name="shopId" value={shopId} />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="hhmm" value={hhmm} />
          {postNo != null && <input type="hidden" name="postNo" value={postNo} />}
          <input type="hidden" name="return" value={returnTo} />
          <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" name="force" value="1">Перенести всё равно</button>
        </form>
      </>
    }>
      <ul className="warn-list">
        {warns.map(w => <li key={w}>{SLOT_WARNING_LABEL[w]}</li>)}
      </ul>
      {conflicts.length > 0 && (
        <p className="hint">Пересечение: {conflicts.map(c => `${c.at} (пост ${c.postNo})`).join(", ")}</p>
      )}
    </Sheet>
  );
}
