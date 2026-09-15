import Link from "next/link";
import { Icon } from "@/components/Icon";

/**
 * Шапка экрана на телефоне: стрелка назад, заголовок с подзаголовком,
 * колокол. На вебе её нет — там заголовок раздела рисует сам экран
 * (`.head`), потому что подписи у них разные: «Записи / 15 сентября»
 * против «15 сентября, вторник / 7 записей · 3 поста».
 */
export function ScreenHead({ title, sub, back, unread = 0 }: { title: string; sub?: string; back?: string; unread?: number }) {
  return (
    <header className="app-top">
      {back && (
        <Link className="t-back" href={back} aria-label="Назад">
          <Icon name="chevron" size={20} />
        </Link>
      )}
      <div className="t-mid">
        <div className="t-title">{title}</div>
        {sub && <div className="t-sub">{sub}</div>}
      </div>
      <Link className="bell" href="/uvedomleniya" aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="dot" />}
      </Link>
    </header>
  );
}
