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
 * клик.
 *
 * ЧЕСТНО ПРО ГРАНИЦУ: для запросов через site-api граница — сайт по
 * actorUserId, но записи и клиентов приложение читает из общей базы НАПРЯМУЮ
 * под сервисным ключом, и там границей служит именно членство (shop.ts:
 * «выключенный не получает витрину вовсе»). Поэтому увольнение из ЭТОГО
 * процесса обязано доезжать мгновенно — invalidateMyShops (staff-actions.ts)
 * сбрасывает запись и поднимает эпоху, так что даже запрос, ушедший к сайту
 * ДО сброса, свой устаревший ответ в кэш не запишет. Правка с другой стороны
 * (админка сайта, соседний контейнер в момент деплоя) доезжает за ≤30
 * секунд — принятый размен: там же увольняют через этот экран.
 *
 * Ошибки сайта не кэшируем: молчание сайта не должно на 30 секунд отрезать
 * сотрудника от витрины, следующий рендер спросит снова.
 */
const MY_SHOPS_TTL_MS = 30_000;
/** Потолок записей — чтобы кэш не рос без границы; старейшая вытесняется. */
const MY_SHOPS_MAX = 500;
const myShops = new Map<string, { at: number; shops: MyShopMembership[] }>();
/** Эпоха сбросов по userId: ответ, начатый до invalidateMyShops, в кэш не попадает. */
const myShopsEpoch = new Map<string, number>();

export async function fetchMyShops(actorUserId: string): Promise<ApiResult<MyShopMembership[]>> {
  const hit = myShops.get(actorUserId);
  // Копия наружу: общий массив по ссылке дал бы будущему sort()/push() у
  // вызывающего отравить кэш всем запросам процесса.
  if (hit && Date.now() - hit.at < MY_SHOPS_TTL_MS) return { ok: true, data: [...hit.shops] };
  const epoch = myShopsEpoch.get(actorUserId) ?? 0;
  const res = await siteGet<MyShopMembership[]>("members/mine", { actorUserId });
  if (res.ok && (myShopsEpoch.get(actorUserId) ?? 0) === epoch) {
    // delete + set держит порядок Map порядком записи: первый ключ — старейший.
    myShops.delete(actorUserId);
    if (myShops.size >= MY_SHOPS_MAX) {
      const oldest = myShops.keys().next().value;
      if (oldest !== undefined) myShops.delete(oldest);
    }
    myShops.set(actorUserId, { at: Date.now(), shops: [...res.data] });
  }
  return res;
}

/** Сброс кэша после правки доступов: свой процесс видит её сразу же. */
export function invalidateMyShops(userId: string): void {
  myShops.delete(userId);
  myShopsEpoch.set(userId, (myShopsEpoch.get(userId) ?? 0) + 1);
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
