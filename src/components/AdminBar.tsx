// Полоса админ-контекста: админ сайта смотрит чужую витрину владельцем
// (/admin-vhod). В отличие от примерки роли (ViewBar) это НЕ просмотр:
// действия настоящие, и полоса обязана напоминать об этом на каждом экране.
// Серверный компонент: путь возврата не нужен — выход всегда уводит на
// корень, свои экраны у админа не здесь.
import { leaveAdminShopAction } from "@/app/(app)/admin-actions";

export function AdminBar({ shopName }: { shopName: string }) {
  return (
    <form action={leaveAdminShopAction} className="view-bar">
      <span className="view-bar-t">
        Вы в «{shopName}» как админ сайта. Действия настоящие: записи, отчёты и деньги меняются по-настоящему
      </span>
      <button className="aui-btn aui-btn--ghost aui-btn--sm" type="submit">Покинуть сервис</button>
    </form>
  );
}
