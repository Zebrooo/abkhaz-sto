import "server-only";
// Люди сервиса и их роли. Дизайн разводит приложение на три роли: мастер
// видит свой пост, осмотр и чат; админ — записи, клиентов и расписание;
// хозяин — деньги, мастеров и доступы. В схеме записи (sto_bookings) ролей
// нет: витрина принадлежит одному человеку, и до сих пор доступ был «всё или
// ничего». Список сотрудников и их роли ведёт сайт — там уже есть учётки,
// телефоны и подтверждение кодом из СМС.
//
// Роль владельца витрины не хранится и не отзывается: тот, чья витрина,
// всегда owner. Поэтому сайт обязан отдавать его в списке первой строкой с
// canRemove: false — иначе сервис можно оставить без единого хозяина.
// Словарь ролей и границы — в lib/access.ts: их читают экраны, где серверного
// кода быть не должно.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";
import type { StoRole } from "@/lib/access";

export type StoMember = {
  /** Учётка на сайте — она же ключ строки. */
  userId: string;
  name: string;
  phone: string | null;
  role: StoRole;
  /** Мастер, если этот человек ещё и стоит на посту. */
  masterId: number | null;
  /** Выключенный сотрудник входит, но ничего не видит: увольнение без удаления истории. */
  active: boolean;
  /** Владельца витрины убрать нельзя — сервис останется без хозяина. */
  canRemove: boolean;
  addedAt: string;
};

/**
 * Сервисы, где этот человек работает, и его роль в каждом. Один вызов без
 * shopId — сервис ещё не выбран, приложение только входит: владелец находит
 * свою витрину по владению (lib/shop.ts), а мастер и админ витрины не имеют
 * и без этого списка не прошли бы дальше «сервис не найден».
 *
 * Владельца здесь нет — его роль не хранится строкой (см. выше).
 *
 * GET /api/sto/members/mine?actorUserId → MyShopMembership[]
 */
export type MyShopMembership = {
  shopId: number;
  role: StoRole;
  masterId: number | null;
  /** Выключенный сотрудник входит, но ничего не видит. */
  active: boolean;
};

/**
 * Кэш членств на процесс: fetchMyShops зовётся на КАЖДЫЙ рендер каждого
 * экрана (shop.ts → serviceContext), и без кэша это HTTP к сайту на всякий
 * клик. 30 секунд безопасны: роль здесь — подсказка интерфейсу, а не граница
 * доступа (AGENTS.md) — что человеку разрешено на самом деле, сайт проверяет
 * по actorUserId в каждом запросе, поэтому увольнение перестаёт работать
 * сразу, а из меню пропадает следующим запросом после протухания. Правки
 * доступов из ЭТОГО процесса видны мгновенно — их сбрасывает
 * invalidateMyShops (staff-actions.ts).
 *
 * Ошибки сайта не кэшируем: молчание сайта не должно на 30 секунд отрезать
 * сотрудника от витрины, следующий рендер спросит снова.
 */
const MY_SHOPS_TTL_MS = 30_000;
/** Потолок записей — чтобы кэш не рос без границы; старейшая вытесняется. */
const MY_SHOPS_MAX = 500;
const myShops = new Map<string, { at: number; shops: MyShopMembership[] }>();

export async function fetchMyShops(actorUserId: string): Promise<ApiResult<MyShopMembership[]>> {
  const hit = myShops.get(actorUserId);
  if (hit && Date.now() - hit.at < MY_SHOPS_TTL_MS) return { ok: true, data: hit.shops };
  const res = await siteGet<MyShopMembership[]>("members/mine", { actorUserId });
  if (res.ok) {
    // delete + set держит порядок Map порядком записи: первый ключ — старейший.
    myShops.delete(actorUserId);
    if (myShops.size >= MY_SHOPS_MAX) {
      const oldest = myShops.keys().next().value;
      if (oldest !== undefined) myShops.delete(oldest);
    }
    myShops.set(actorUserId, { at: Date.now(), shops: res.data });
  }
  return res;
}

/** Сброс кэша после правки доступов: свой процесс видит её сразу же. */
export function invalidateMyShops(userId: string): void {
  myShops.delete(userId);
}

/** GET /api/sto/members?shopId&actorUserId → StoMember[]; владелец первой строкой. */
export function fetchMembers(shopId: number, actorUserId: string): Promise<ApiResult<StoMember[]>> {
  return siteGet<StoMember[]>("members", { shopId, actorUserId });
}

/**
 * Пригласить по телефону. Учётки может ещё не быть — сайт заводит
 * приглашение и привязывает его к номеру, а роль включается, когда человек
 * войдёт тем же номером. Поэтому ответ — не сотрудник, а состояние: уже
 * работает или ждёт первого входа.
 *
 * POST /api/sto/members/invite { shopId, actorUserId, phone, role, name? }
 */
export type InviteResult = { userId: string | null; pending: boolean };

export function inviteMember(input: {
  shopId: number; actorUserId: string; phone: string; role: StoRole; name?: string;
}): Promise<ApiResult<InviteResult>> {
  return sitePost<InviteResult>("members/invite", input);
}

/** POST /api/sto/members/role { shopId, actorUserId, userId, role } */
export function setMemberRole(input: {
  shopId: number; actorUserId: string; userId: string; role: StoRole;
}): Promise<ApiResult<StoMember>> {
  return sitePost<StoMember>("members/role", input);
}

/** POST /api/sto/members/active { shopId, actorUserId, userId, active } */
export function setMemberActive(input: {
  shopId: number; actorUserId: string; userId: string; active: boolean;
}): Promise<ApiResult<StoMember>> {
  return sitePost<StoMember>("members/active", input);
}
