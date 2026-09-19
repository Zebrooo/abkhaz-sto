// Пока страница ждёт данные, рисуем её контур, а не белый экран: за стойкой
// секунда тишины читается как «всё зависло». Серверный компонент, без
// клиентского кода; стили — .skl в globals.css.
export default function Loading() {
  return (
    <div className="skl" aria-hidden>
      <div className="skl-bar skl-w-40" />
      <div className="card">
        <div className="skl-bar skl-w-70" />
        <div className="skl-bar skl-w-55" />
        <div className="skl-bar skl-w-60" />
      </div>
      <div className="card">
        <div className="skl-bar skl-w-80" />
        <div className="skl-bar skl-w-45" />
      </div>
      <div className="card">
        <div className="skl-bar skl-w-65" />
        <div className="skl-bar skl-w-50" />
      </div>
    </div>
  );
}
