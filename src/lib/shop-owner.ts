import { isValidE164, normalizePhone } from "@/lib/phone";

/**
 * Условие «это его витрина» одной строкой для PostgREST — то же правило, что
 * ownerFilter в shop-owner.ts на сайте: по user_id ИЛИ по телефону учётки.
 *
 * Телефон учётки в profiles лежит БЕЗ плюса («79…»), у витрины — E.164 с
 * плюсом («+7…»): сырой номер не совпадал никогда (16.09.2026, прод и тест),
 * и владелец без user_id упирался в «сервис не найден». Приводим к E.164.
 *
 * ⚠ ТЕЛЕФОН ПОДСТАВЛЯЕТСЯ ТОЛЬКО ПОСЛЕ ПРОВЕРКИ ФОРМЫ. Запятая в or()
 * разделяет условия: непроверенный номер из профиля позволил бы дописать в
 * фильтр чужое условие и вытащить чужие витрины. isValidE164 оставляет
 * только «+» и цифры. Пустой или кривой номер — фильтр по одному user_id.
 */
export function ownerFilter(userId: string, accountPhone: string | null | undefined): string {
  const phone = normalizePhone(accountPhone);
  return isValidE164(phone)
    ? `user_id.eq.${userId},phone.eq.${phone}`
    : `user_id.eq.${userId}`;
}
