import Link from "next/link";
import { getServerUser } from "@/lib/supabase/server";

// Вход делается на сайте: кука сессии общая для поддоменов (aa-auth-token на
// .abkhaz-auto.ru), и после входа на abkhaz-auto.ru человек уже вошёл и
// здесь. Своих экранов ввода кода нет намеренно — каналы входа (звонок,
// Telegram, СМС) живут на сайте, и дублировать их значит поддерживать дважды.
export default async function VhodPage() {
  const user = await getServerUser();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://abkhaz-auto.ru").replace(/\/$/, "");
  return (
    <main>
      <div className="card">
        <h2>Вход для автосервиса</h2>
        {user ? (
          <>
            <p>Вы вошли как <b>{user.phone || user.email || user.id}</b>.</p>
            <Link className="btn btn-primary" href="/segodnya">Открыть записи</Link>
          </>
        ) : (
          <>
            <p>Войдите на сайте Абхаз Авто по номеру телефона, на который зарегистрирована витрина сервиса, и вернитесь сюда.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={`${site}/vhod?next=/lk`}>Войти на сайте</a>
              <Link className="btn" href="/segodnya">Я уже вошёл</Link>
            </div>
            <p className="muted small">Нет витрины? Подключение делает менеджер площадки: телефон и режим работы сервиса, прайс — и через 15 минут можно принимать записи.</p>
          </>
        )}
      </div>
    </main>
  );
}
