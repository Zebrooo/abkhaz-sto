import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatPhone } from "@/lib/format";
import { getServerUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

// Вход делается на сайте: кука сессии общая для поддоменов (aa-auth-token на
// .abkhaz-auto.ru), и после входа на abkhaz-auto.ru человек уже вошёл и
// здесь. Своих экранов ввода кода нет намеренно — каналы входа (звонок,
// Telegram, СМС) живут на сайте, и дублировать их значит поддерживать дважды.
// Каркаса приложения тут тоже нет: ни вкладок, ни разделов, пока не понятно,
// чей это сервис.
export default async function VhodPage() {
  const user = await getServerUser();
  const site = siteUrl();
  return (
    <main className="gate">
      <div className="card empty">
        <span className="sq"><Icon name="shop" size={26} /></span>
        <div className="empty-t">Вход для автосервиса</div>
        {user ? (
          <>
            <div className="empty-s">Вы вошли как {formatPhone(user.phone) || user.email || user.id}.</div>
            <Link className="aui-btn aui-btn--primary aui-btn--md" href="/segodnya">Открыть записи</Link>
          </>
        ) : (
          <>
            <div className="empty-s">Войдите на сайте Абхаз Авто по номеру телефона, на который зарегистрирована витрина сервиса, и вернитесь сюда.</div>
            <div className="hero-actions">
              <a className="aui-btn aui-btn--primary aui-btn--md" href={`${site}/vhod?next=/lk`}>Войти на сайте</a>
              <Link className="aui-btn aui-btn--ghost aui-btn--md" href="/segodnya">Я уже вошёл</Link>
            </div>
            <p className="hint">Нет витрины? Подключение делает менеджер площадки: телефон и режим работы сервиса, прайс — и через 15 минут можно принимать записи.</p>
          </>
        )}
      </div>
    </main>
  );
}
