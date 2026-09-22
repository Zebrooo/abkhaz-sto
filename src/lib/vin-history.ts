// VIN записи — из истории клиента (спека abkhaz-auto
// 2026-09-22-sto-booking-garage-vin, раздел 2.1): прежде чем просить
// администратора вписать VIN с кузова, смотрим прошлые записи этого клиента.
//
// Правило осторожное: по совпадению госномера (той же нормализацией, что
// склеивает машины в карточках) — VIN точно этой машины; без номера — только
// когда у клиента в истории РОВНО ОДИН различный VIN: у человека с двумя
// машинами угадывать нельзя.
import { clientVinRows, setBookingVin } from "@/lib/bookings";
import { clientKey, type ClientSnapshotRow } from "@/lib/clients";
import type { StoBookingRow } from "@/lib/sto/types";
import { normalizePlate } from "@/lib/vehicles";

// rows — лёгкие строки истории (clientVinRows): здесь читается только снимок
// машины, и тянуть ради него data целиком по всей истории клиента незачем.
export function vinFromHistory(rows: readonly ClientSnapshotRow[], booking: StoBookingRow): string | null {
  if (booking.data.vehicle?.vin) return null;
  const plate = normalizePlate(booking.data.vehicle?.plate);
  if (plate) {
    const hit = rows.find(r => r.data.vehicle?.vin && normalizePlate(r.data.vehicle?.plate) === plate);
    return hit?.data.vehicle?.vin ?? null;
  }
  const vins = [...new Set(rows.map(r => r.data.vehicle?.vin).filter((v): v is string => !!v))];
  return vins.length === 1 ? vins[0] : null;
}

/**
 * Ленивое дописывание при чтении карточки: VIN нашёлся в истории — сохраняем
 * и отдаём обновлённую запись, админский шаг не показывается вовсе. Тот же
 * домовый приём, что закрепление user_id витрины в lib/shop.ts: чтение
 * чинит данные, которые само же и вычислило.
 */
export async function ensureBookingVin(shopId: number, b: StoBookingRow): Promise<StoBookingRow> {
  if (b.data.vehicle?.vin) return b;
  const rows = await clientVinRows(shopId, clientKey(b));
  const vin = vinFromHistory(rows.filter(r => r.id !== b.id), b);
  if (!vin) return b;
  return (await setBookingVin(shopId, b.id, vin)) ?? b;
}
