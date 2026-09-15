/** Итог действия из адреса: ?ok=1 или ?err=текст. */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="err" role="alert">{err}</div>;
  if (ok) return <div className="ok" role="status">Сохранено</div>;
  return null;
}
