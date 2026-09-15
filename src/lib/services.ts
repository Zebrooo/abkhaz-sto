import "server-only";
// Услуги сервиса — объявления его витрины в разделе «Услуги» (модель Маркета):
// длительность живёт в attrs.duration_min. Создание новых услуг и типовой
// прайс — #1271 (через API сайта); здесь чтение и правка цены/длительности.
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_STO_DURATION_MIN, MAX_STO_DURATION_MIN, MIN_STO_DURATION_MIN, type Currency, type StoBookingService } from "@/lib/sto/types";

export type ServiceItem = {
  listingId: number;
  slug: string;
  title: string;
  price: number | null;
  currency: Currency;
  durationMin: number;
  status: string;
};

type Row = { id: number; slug: string; title: string; price: number | string | null; currency: string | null; status: string; attrs: Record<string, unknown> | null };

function durationFromAttrs(attrs: Record<string, unknown> | null): number {
  const v = Number(attrs?.duration_min);
  return Number.isInteger(v) && v >= MIN_STO_DURATION_MIN && v <= MAX_STO_DURATION_MIN ? v : DEFAULT_STO_DURATION_MIN;
}

export async function listServices(shopId: number): Promise<ServiceItem[]> {
  const { data, error } = await createSupabaseAdmin().from("listings")
    .select("id, slug, title, price, currency, status, attrs")
    .eq("shop_id", shopId).eq("category_slug", "uslugi").in("status", ["active", "hidden", "pending"])
    .order("title").returns<Row[]>();
  if (error) {
    console.error("[сто] услуги не прочитались:", error.message);
    return [];
  }
  return (data ?? []).map(r => ({
    listingId: r.id, slug: r.slug, title: r.title,
    price: r.price == null ? null : Number(r.price),
    currency: (r.currency === "USD" || r.currency === "EUR" ? r.currency : "RUB"),
    durationMin: durationFromAttrs(r.attrs), status: r.status,
  }));
}

export function toBookingService(s: ServiceItem): StoBookingService {
  return { title: s.title, price: s.price, currency: s.currency, durationMin: s.durationMin };
}

/** Правка цены и длительности своей услуги; attrs сливаются, не затираются. */
export async function updateService(shopId: number, listingId: number, patch: { price: number | null; durationMin: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(patch.durationMin) || patch.durationMin < MIN_STO_DURATION_MIN || patch.durationMin > MAX_STO_DURATION_MIN) {
    return { ok: false, error: `Длительность — от ${MIN_STO_DURATION_MIN} до ${MAX_STO_DURATION_MIN} минут` };
  }
  if (patch.price != null && (!Number.isFinite(patch.price) || patch.price < 0 || patch.price > 10_000_000)) {
    return { ok: false, error: "Цена — число от 0 до 10 000 000" };
  }
  const admin = createSupabaseAdmin();
  const { data: row } = await admin.from("listings").select("attrs").eq("id", listingId).eq("shop_id", shopId).maybeSingle<{ attrs: Record<string, unknown> | null }>();
  if (!row) return { ok: false, error: "Услуга не найдена" };
  const { error } = await admin.from("listings")
    .update({ price: patch.price, attrs: { ...(row.attrs ?? {}), duration_min: patch.durationMin } })
    .eq("id", listingId).eq("shop_id", shopId);
  if (error) return { ok: false, error: "Не удалось сохранить: " + error.message };
  return { ok: true };
}
