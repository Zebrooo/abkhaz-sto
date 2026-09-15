import Link from "next/link";
import { Icon } from "@/components/Icon";
import { STO_ROLE_LABEL } from "@/lib/access";
import { serviceContext } from "@/lib/context";

/**
 * Шапка экрана на телефоне: стрелка назад, заголовок с подзаголовком,
 * колокол. На вебе её нет — там заголовок раздела рисует сам экран
 * (`.head`), потому что подписи у них разные: «Записи / 15 сентября»
 * против «15 сентября, вторник / 7 записей · 3 поста».
 *
 * Бейдж роли перед подзаголовком — как в макете: человек за телефоном
 * видит, кем вошёл. Роль шапка берёт сама из serviceContext (он один на
 * запрос), а не из пропса: иначе её пришлось бы прокидывать через каждый
 * экран ради одной подписи.
 */
export async function ScreenHead({ title, sub, back, unread = 0 }: { title: string; sub?: string; back?: string; unread?: number }) {
  const ctx = await serviceContext();
  return (
    <header className="app-top">
      {back && (
        <Link className="t-back" href={back} aria-label="Назад">
          <Icon name="chevron" size={20} />
        </Link>
      )}
      <div className="t-mid">
        <div className="t-title">{title}</div>
        <div className="t-line">
          {ctx && <span className="role-chip">{STO_ROLE_LABEL[ctx.role]}</span>}
          {sub && <div className="t-sub">{sub}</div>}
        </div>
      </div>
      <Link className="bell" href="/uvedomleniya" aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="dot" />}
      </Link>
    </header>
  );
}
