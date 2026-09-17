// Клиенты сервиса — не отдельная таблица, а свод по его записям: своей
// базы клиентов у приложения нет и не будет (схема живёт в abkhaz-auto),
// а карточка «кто к нам ездит» собирается из снимков записи. Ключ строки —
// учётка клиента, иначе телефон, иначе имя: так две записи одного человека
// склеиваются, а два «Ивана» без телефона не сливаются в одного.
import type { StoBookingRow } from "@/lib/sto/types";
import { normalizePhone } from "@/lib/phone";

export type ClientCar = { name: string; meta: string; plate: string | null };

export type ClientSummary = {
  /** Ключ для адреса /klienty/<key>. */
  key: string;
  name: string;
  phone: string | null;
  /** Последняя машина — её видно в строке списка. */
  car: string | null;
  visits: number;
  /** Последняя запись (ISO), по ней сортируем и показываем давность. */
  lastAt: string;
  /** Деньги по выполненным записям. */
  spent: number;
};

export type ClientCard = ClientSummary & {
  cars: ClientCar[];
  history: StoBookingRow[];
};

function carLine(b: StoBookingRow): string | null {
  const v = b.data.vehicle;
  if (!v) return null;
  return [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || null;
}

function carMeta(b: StoBookingRow): string {
  const v = b.data.vehicle;
  if (!v) return "";
  return [v.year ? `${v.year} год` : null, v.plate].filter(Boolean).join(" · ");
}

function nameOf(b: StoBookingRow): string {
  return b.data.client?.name?.trim() || (b.client_id ? "Клиент с сайта" : "Клиент");
}

function phoneOf(b: StoBookingRow): string | null {
  return normalizePhone(b.data.client?.phone) ?? null;
}

/** Ключ клиента: учётка → телефон → имя. Безопасен для адреса. */
export function clientKey(b: StoBookingRow): string {
  if (b.client_id) return `u${b.client_id}`;
  const phone = phoneOf(b);
  if (phone) return `p${phone.replace(/\D+/g, "")}`;
  return `n${encodeURIComponent(nameOf(b).toLowerCase())}`;
}

/** Свод клиентов по записям, свежие визиты сверху. */
export function summarizeClients(rows: readonly StoBookingRow[]): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const b of rows) {
    const key = clientKey(b);
    const prev = map.get(key);
    const spent = b.status === "done" ? (b.service.price ?? 0) : 0;
    if (!prev) {
      map.set(key, { key, name: nameOf(b), phone: phoneOf(b), car: carLine(b), visits: 1, lastAt: b.starts_at, spent });
      continue;
    }
    prev.visits += 1;
    prev.spent += spent;
    // rows приходят свежими сверху, но функция чистая — сравниваем честно.
    if (b.starts_at > prev.lastAt) {
      prev.lastAt = b.starts_at;
      prev.car = carLine(b) ?? prev.car;
    }
    prev.phone = prev.phone ?? phoneOf(b);
    if (prev.name.startsWith("Клиент") && !nameOf(b).startsWith("Клиент")) prev.name = nameOf(b);
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Карточка одного клиента: контакты, его машины и история записей. */
export function clientCard(rows: readonly StoBookingRow[], key: string): ClientCard | null {
  const mine = rows.filter(b => clientKey(b) === key);
  if (mine.length === 0) return null;
  const summary = summarizeClients(mine)[0];
  const cars = new Map<string, ClientCar>();
  for (const b of mine) {
    const name = carLine(b);
    if (!name || cars.has(name)) continue;
    cars.set(name, { name, meta: carMeta(b), plate: b.data.vehicle?.plate ?? null });
  }
  return { ...summary, cars: [...cars.values()], history: [...mine].sort((a, b) => b.starts_at.localeCompare(a.starts_at)) };
}

/**
 * Поиск по имени, телефону и машине — одной строкой, как в макете. Берёт
 * не всю карточку, а только эти три поля: тем же правилом ищет строка
 * «Имя» в ручной записи (components/ClientPick.tsx), где карточка целиком
 * в браузер не уезжает.
 */
export function matchClient(c: Pick<ClientSummary, "name" | "phone" | "car">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D+/g, "");
  if (digits.length >= 3 && c.phone && c.phone.replace(/\D+/g, "").includes(digits)) return true;
  return `${c.name} ${c.car ?? ""}`.toLowerCase().includes(q);
}
