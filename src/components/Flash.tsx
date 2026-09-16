import { Icon } from "@/components/Icon";

/**
 * Итог действия из адреса. Удачу показываем тостом внизу — он гаснет сам
 * через 2,4 с чистым CSS, без «смонтировано» и таймеров; неудачу — красной
 * карточкой в потоке экрана: её надо прочитать и исправить, а не поймать.
 */
export function Flash({ ok, err, title = "Не сохранилось" }: { ok?: string; err?: string; title?: string }) {
  if (err) {
    return (
      <div className="card card-danger" role="alert">
        {/* Заголовок — по умолчанию про сохранение; ошибке загрузки экран даёт свой. */}
        <div className="err-t">{title}</div>
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
