// Блок «VIN не указан» — админский шаг добора VIN у записи с сайта (спека
// abkhaz-auto 2026-09-22-sto-booking-garage-vin, раздел 2.2). Показывается,
// только когда VIN не нашёлся ни в снимке машины, ни в истории клиента
// (ensureBookingVin) — и на карточке записи, и на осмотре, БЕЗ блокировок:
// машина не должна стоять у подъёмника из-за поля в форме.
import { saveBookingVinAction } from "@/app/(app)/actions";

export function BookingVin({ shopId, bookingId, returnTo }: { shopId: number; bookingId: number; returnTo: string }) {
  return (
    <div className="card card-sm card-accent">
      <div className="card-t">VIN не указан</div>
      <div className="card-s">Впишите с кузова или из ПТС — по VIN клеится история машины и отчёты для клиента.</div>
      <form action={saveBookingVinAction} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
        <input type="hidden" name="shopId" value={shopId} />
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="return" value={returnTo} />
        <label className="fld" style={{ flex: 1 }}>
          <span>VIN</span>
          <input name="vin" placeholder="XW8ED45J8DK123456" autoCapitalize="characters" autoComplete="off" required />
        </label>
        <button className="aui-btn aui-btn--primary aui-btn--sm" type="submit">Сохранить</button>
      </form>
    </div>
  );
}
