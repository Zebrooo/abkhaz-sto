// Клиенты сервиса — не отдельная таблица, а свод по его записям: своей
// базы клиентов у приложения нет и не будет (схема живёт в abkhaz-auto),
// а карточка «кто к нам ездит» собирается из снимков записи. Ключ строки —
// учётка клиента, иначе телефон, иначе имя: так две записи одного человека
// склеиваются, а два «Ивана» без телефона не сливаются в одного.
import type { StoBookingRow } from "@/lib/sto/types";
import { normalizePhone } from "@/lib/phone";
import { foldLookalike } from "@/lib/vehicle-input";

export type ClientSummary = {
  /** Ключ для адреса /klienty/<key>. */
  key: string;
  name: string;
  phone: string | null;
  /** Последняя машина — её видно в строке списка. */
  car: string | null;
  /** Госномер последней машины — по нему в сервисе ищут человека чаще, чем по фамилии. */
  plate: string | null;
  /** VIN последней машины — им ищут, когда номер уже сменился. */
  vin: string | null;
  /** ВСЕ его номера и VIN: ищут и по позапрошлой машине, которую он продал. */
  plates: string[];
  vins: string[];
  visits: number;
  /** Последняя запись (ISO), по ней сортируем и показываем давность. */
  lastAt: string;
  /** Деньги по выполненным записям. */
  spent: number;
};

export type ClientCard = ClientSummary & { history: StoBookingRow[] };

function carLine(b: StoBookingRow): string | null {
  const v = b.data.vehicle;
  if (!v) return null;
  return [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || null;
}

function nameOf(b: StoBookingRow): string {
  return b.data.client?.name?.trim() || (b.client_id ? "Клиент с сайта" : "Клиент");
}

function phoneOf(b: StoBookingRow): string | null {
  return normalizePhone(b.data.client?.phone) ?? null;
}

/**
 * Ключ клиента по частям снимка — там, где целой строки записи нет: лёгкие
 * запросы lib/bookings.ts читают только client_id и data.client и обязаны
 * склеивать клиентов ровно так же. Учётка выше уже вернула u-ключ, поэтому
 * запасное имя здесь одно — «Клиент».
 */
export function clientKeyOf(clientId: string | null, client: { name?: string | null; phone?: string | null } | null | undefined): string {
  if (clientId) return `u${clientId}`;
  const phone = normalizePhone(client?.phone) ?? null;
  if (phone) return `p${phone.replace(/\D+/g, "")}`;
  return `n${encodeURIComponent((client?.name?.trim() || "Клиент").toLowerCase())}`;
}

/** Ключ клиента: учётка → телефон → имя. Безопасен для адреса. */
export function clientKey(b: Pick<StoBookingRow, "client_id" | "data">): string {
  return clientKeyOf(b.client_id, b.data.client);
}

/** Свод клиентов по записям, свежие визиты сверху. */
export function summarizeClients(rows: readonly StoBookingRow[]): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const b of rows) {
    const key = clientKey(b);
    const prev = map.get(key);
    const spent = b.status === "done" ? (b.service.price ?? 0) : 0;
    if (!prev) {
      map.set(key, {
        key, name: nameOf(b), phone: phoneOf(b), car: carLine(b),
        plate: b.data.vehicle?.plate ?? null, vin: b.data.vehicle?.vin ?? null,
        plates: b.data.vehicle?.plate ? [b.data.vehicle.plate] : [],
        vins: b.data.vehicle?.vin ? [b.data.vehicle.vin] : [],
        visits: 1, lastAt: b.starts_at, spent,
      });
      continue;
    }
    prev.visits += 1;
    prev.spent += spent;
    // rows приходят свежими сверху, но функция чистая — сравниваем честно.
    // Машина, номер и VIN — ИЗ ОДНОГО СНИМКА: иначе в строке списка марка от
    // сегодняшней машины, а номер от позапрошлой. На поиск работают plates и
    // vins, там собраны все.
    if (b.starts_at > prev.lastAt) {
      prev.lastAt = b.starts_at;
      if (carLine(b)) {
        prev.car = carLine(b);
        prev.plate = b.data.vehicle?.plate ?? null;
        prev.vin = b.data.vehicle?.vin ?? null;
      }
    }
    const p = b.data.vehicle?.plate, v = b.data.vehicle?.vin;
    if (p && !prev.plates.includes(p)) prev.plates.push(p);
    if (v && !prev.vins.includes(v)) prev.vins.push(v);
    prev.phone = prev.phone ?? phoneOf(b);
    if (prev.name.startsWith("Клиент") && !nameOf(b).startsWith("Клиент")) prev.name = nameOf(b);
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/**
 * Карточка одного клиента: контакты и история записей. Машины сюда не
 * входят: у них своя карточка и свой свод (lib/vehicles.ts) — иначе
 * «какие у человека машины» считалось бы в двух местах по-разному.
 */
export function clientCard(rows: readonly StoBookingRow[], key: string): ClientCard | null {
  const mine = rows.filter(b => clientKey(b) === key);
  if (mine.length === 0) return null;
  const summary = summarizeClients(mine)[0];
  return { ...summary, history: [...mine].sort((a, b) => b.starts_at.localeCompare(a.starts_at)) };
}

/**
 * Поиск по имени, телефону, машине, госномеру и VIN — одной строкой, как в
 * макете. Берёт не всю карточку, а только эти поля: тем же правилом ищет
 * строка «Имя» в ручной записи (components/ClientPick.tsx), где карточка
 * целиком в браузер не уезжает.
 *
 * Номер и VIN сравниваем схлопнутыми к латинице (lib/vehicle-input.ts):
 * «А123АВ» с русской раскладки и «A123AB» с латинской — одна машина, и
 * человек, который ищет по табличке, не должен угадывать раскладку. По VIN
 * ищут хвостом — вслух называют последние знаки, а не все семнадцать.
 */
export function matchClient(
  c: Pick<ClientSummary, "name" | "phone" | "car">
    & { plate?: string | null; vin?: string | null; plates?: string[]; vins?: string[] },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D+/g, "");
  if (digits.length >= 3 && c.phone && c.phone.replace(/\D+/g, "").includes(digits)) return true;
  const tight = foldLookalike(q.replace(/[\s-]+/g, ""));
  // Ищем по ВСЕМ его машинам, а не только по последней: человек называет
  // номер той, на которой приезжал в прошлый раз, а с тех пор сменил машину.
  const marks = [...(c.plates ?? []), ...(c.vins ?? []), c.plate, c.vin];
  if (tight.length >= 3 && marks.some(x => x && foldLookalike(x.replace(/[\s-]+/g, "")).includes(tight))) return true;
  return `${c.name} ${c.car ?? ""}`.toLowerCase().includes(q);
}
