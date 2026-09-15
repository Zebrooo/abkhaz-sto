import "server-only";
// Чат с клиентом. Переписка живёт в базе сайта — клиент пишет из своей
// записи на abkhaz-auto.ru, и другого чата у него нет. Поэтому приложение
// не заводит свой: оно читает диалоги сервиса и отправляет в тот же тред.
//
// ПОЧЕМУ СНАЧАЛА ТОЛЬКО ЧТЕНИЕ. Диалог привязан к объявлению, и правила
// «кто кому может написать» на сайте свои (блокировки, жалобы, стоп-слова).
// Пока sendMessage на стороне сайта не сделан, экран показывает переписку и
// уводит отвечать на сайт по threadUrl — это честнее, чем своя форма,
// которая молча не доставит.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";

export type ChatThread = {
  id: string;
  /** Запись, по которой идёт разговор; null — написали просто по объявлению. */
  bookingId: number | null;
  clientName: string;
  clientPhone: string | null;
  lastText: string;
  lastAt: string;
  unread: number;
  /** Куда уйти отвечать, пока своей отправки нет. */
  threadUrl: string;
};

export type ChatMessage = {
  id: string;
  /** Написал сервис, а не клиент. */
  mine: boolean;
  text: string;
  at: string;
};

/** GET /api/sto/chat/threads?shopId&actorUserId → ChatThread[] */
export function fetchThreads(shopId: number, actorUserId: string): Promise<ApiResult<ChatThread[]>> {
  return siteGet<ChatThread[]>("chat/threads", { shopId, actorUserId });
}

/** GET /api/sto/chat/messages?shopId&actorUserId&threadId&limit → ChatMessage[] */
export function fetchMessages(input: {
  shopId: number; actorUserId: string; threadId: string; limit?: number;
}): Promise<ApiResult<ChatMessage[]>> {
  return siteGet<ChatMessage[]>("chat/messages", input);
}

/** Сколько непрочитанных всего — цифра на вкладке и в меню. */
export function fetchUnread(shopId: number, actorUserId: string): Promise<ApiResult<{ unread: number }>> {
  return siteGet<{ unread: number }>("chat/unread", { shopId, actorUserId });
}

/**
 * Отправить сообщение в тред. Появится, когда сайт откроет маршрут; до тех
 * пор вызов вернёт not_found, и экран оставит переход по threadUrl.
 *
 * POST /api/sto/chat/send { shopId, actorUserId, threadId, text }
 */
export function sendMessage(input: {
  shopId: number; actorUserId: string; threadId: string; text: string;
}): Promise<ApiResult<ChatMessage>> {
  return sitePost<ChatMessage>("chat/send", input);
}
