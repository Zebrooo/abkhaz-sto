import { Icon } from "@/components/Icon";

/**
 * Итог действия из адреса. Удачу показываем тостом внизу — он гаснет сам
 * через 2,4 с чистым CSS, без «смонтировано» и таймеров; неудачу — красной
 * карточкой в потоке экрана: её надо прочитать и исправить, а не поймать.
 */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) {
    return (
      <div className="card card-danger" role="alert">
        <div className="err-t">Не сохранилось</div>
        <div className="err-s">{err}</div>
      </div>
    );
  }
  if (!ok) return null;
  return (
    <div className="toast-wrap">
      <div className="toast" role="status">
        <i><Icon name="check" size={13} /></i>
        {ok === "1" ? "Сохранено" : ok}
      </div>
    </div>
  );
}
