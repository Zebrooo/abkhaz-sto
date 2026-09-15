"use server";
// Серверные действия экранов. Каждое: пользователь → его сервис (владение)
// → библиотека → revalidate → назад на экран с итогом в адресе (?ok= / ?err=).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { ownedServiceShop } from "@/lib/shop";
import { createManualBooking, rescheduleBooking, transitionBooking } from "@/lib/bookings";
import { listServices, toBookingService, updateService } from "@/lib/services";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { validateStoPrepay, validateStoSchedule, STO_DAYS } from "@/lib/sto/schedule";
import type { StoTransition } from "@/lib/sto/transitions";
import { normalizePhone } from "@/lib/phone";

function back(path: string, q: Record<string, string | undefined>): never {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  redirect(s ? `${path}?${s}` : path);
}

async function ctx(fd: FormData) {
  const user = await getServerUser();
  if (!user) redirect("/vhod");
  const shopId = Number(fd.get("shopId"));
  const shop = Number.isInteger(shopId) ? await ownedServiceShop(shopId) : null;
  if (!shop) redirect("/");
  return { user, shop };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function transitionAction(fd: FormData) {
  const { user, shop } = await ctx(fd);
  const ret = str(fd, "return") || "/segodnya";
  const t = str(fd, "transition") as StoTransition;
  if (!["confirm", "done", "no_show", "cancel"].includes(t)) back(ret, { err: "Неизвестное действие" });
  const res = await transitionBooking({ shopId: shop.id, bookingId: Number(str(fd, "bookingId")), transition: t, actorUserId: user.id, reason: str(fd, "reason") || undefined });
  revalidatePath("/segodnya"); revalidatePath("/kalendar");
  back(ret, res.ok ? { ok: "1" } : { err: res.error });
}

export async function rescheduleAction(fd: FormData) {
  const { user, shop } = await ctx(fd);
  const ret = str(fd, "return") || "/kalendar";
  if (!shop.schedule) back(ret, { err: "Сначала задайте расписание" });
  const res = await rescheduleBooking({ shopId: shop.id, bookingId: Number(str(fd, "bookingId")), schedule: shop.schedule, day: str(fd, "day"), hhmm: str(fd, "hhmm"), actorUserId: user.id });
  revalidatePath("/segodnya"); revalidatePath("/kalendar");
  back(res.ok ? `/segodnya` : ret, res.ok ? { d: str(fd, "day"), ok: "1" } : { err: res.error });
}

export async function createManualAction(fd: FormData) {
  const { user, shop } = await ctx(fd);
  const day = str(fd, "day");
  const listingId = Number(str(fd, "listingId"));
  const ret = `/kalendar/novaya`;
  if (!shop.schedule) back(ret, { err: "Сначала задайте расписание" });
  const services = await listServices(shop.id);
  const svc = services.find(s => s.listingId === listingId);
  if (!svc) back(ret, { d: day, err: "Выберите услугу" });
  const name = str(fd, "name");
  if (!name) back(ret, { d: day, s: String(listingId), err: "Имя клиента обязательно" });
  const phoneRaw = str(fd, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) back(ret, { d: day, s: String(listingId), err: "Телефон не разобран — укажите в формате +7…" });
  const hhmm = str(fd, "hhmm");
  if (!/^\d{2}:\d{2}$/.test(hhmm)) back(ret, { d: day, s: String(listingId), err: "Выберите время" });
  const res = await createManualBooking({
    shopId: shop.id, schedule: shop.schedule, day, hhmm, service: toBookingService(svc), listingId: svc.listingId,
    client: { name: name.slice(0, 80), phone }, vehicle: str(fd, "vehicle"), comment: str(fd, "comment"), actorUserId: user.id,
  });
  revalidatePath("/segodnya"); revalidatePath("/kalendar");
  if (!res.ok) back(ret, { d: day, s: String(listingId), err: res.error });
  back("/segodnya", { d: day, ok: "1" });
}

export async function saveScheduleAction(fd: FormData) {
  const { shop } = await ctx(fd);
  const days: Record<string, { from: string; to: string }[]> = {};
  for (const d of STO_DAYS) {
    const list: { from: string; to: string }[] = [];
    for (const i of [1, 2]) {
      const from = str(fd, `${d}_${i}_from`);
      const to = str(fd, `${d}_${i}_to`);
      if (from || to) list.push({ from, to });
    }
    days[d] = list;
  }
  const daysOff = str(fd, "daysOff").split(/[\s,;]+/).filter(Boolean);
  const v = validateStoSchedule({ days, posts: Number(str(fd, "posts")), stepMin: Number(str(fd, "stepMin")), daysOff });
  if (!v.ok) back("/raspisanie", { err: v.error });
  const mode = str(fd, "prepayMode");
  const p = validateStoPrepay({
    mode, amount: Number(str(fd, "prepayAmount")), percent: Number(str(fd, "prepayPercent")),
    freeCancelHours: str(fd, "freeCancelHours") === "" ? undefined : Number(str(fd, "freeCancelHours")),
  });
  if (!p.ok) back("/raspisanie", { err: p.error });
  const { error } = await createSupabaseAdmin().from("shops").update({ sto_schedule: v.schedule, sto_prepay: p.prepay }).eq("id", shop.id);
  if (error) back("/raspisanie", { err: "Не удалось сохранить: " + error.message });
  revalidatePath("/", "layout");
  back("/raspisanie", { ok: "1" });
}

export async function saveServiceAction(fd: FormData) {
  const { shop } = await ctx(fd);
  const priceRaw = str(fd, "price");
  const res = await updateService(shop.id, Number(str(fd, "listingId")), {
    price: priceRaw === "" ? null : Number(priceRaw.replace(",", ".")),
    durationMin: Number(str(fd, "durationMin")),
  });
  revalidatePath("/uslugi");
  back("/uslugi", res.ok ? { ok: "1" } : { err: res.error });
}
