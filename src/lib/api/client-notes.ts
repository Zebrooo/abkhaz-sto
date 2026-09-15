import "server-only";
// Заметка сервиса о клиенте: «просит звонить после 18:00», «масло привозит
// своё». Своей базы клиентов у приложения нет — карточка собирается из
// снимков записей (lib/clients.ts), и приписать к ней что-то своё можно
// только там, где есть хранилище.
//
// Ключ — тот же clientKey, что строит приложение (учётка → телефон → имя):
// у клиента без учётки другого устойчивого ключа не существует, а
// переезжать на client_id, когда человек заведёт учётку, заметке незачем —
// она привязана к тому, кого сервис узнаёт в лицо.
import { siteGet, sitePost, type ApiResult } from "@/lib/api/site-api";

export type ClientNote = {
  clientKey: string;
  text: string;
  updatedAt: string;
  /** Кто написал — видно в карточке, чтобы не спрашивать «чья это заметка». */
  authorName: string | null;
};

/**
 * Заметки о клиентах сервиса разом: экран клиентов рисует список и не может
 * сходить за каждой строкой отдельно. Ключи — те, что нужны экрану.
 *
 * GET /api/sto/client-notes?shopId&actorUserId&keys=a,b,c → ClientNote[]
 */
export function fetchClientNotes(input: {
  shopId: number; actorUserId: string; keys: string[];
}): Promise<ApiResult<ClientNote[]>> {
  if (input.keys.length === 0) return Promise.resolve({ ok: true, data: [] });
  return siteGet<ClientNote[]>("client-notes", {
    shopId: input.shopId,
    actorUserId: input.actorUserId,
    keys: input.keys.join(","),
  });
}

/** Пустой текст стирает заметку — отдельного «удалить» не нужно. */
export function saveClientNote(input: {
  shopId: number; actorUserId: string; clientKey: string; text: string;
}): Promise<ApiResult<ClientNote | null>> {
  return sitePost<ClientNote | null>("client-notes/save", input);
}
