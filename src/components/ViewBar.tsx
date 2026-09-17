"use client";
// Полоса примерки роли. Клиентская ровно по одной причине: чтобы вернуть
// человека на ТОТ ЖЕ экран, надо знать, где он стоит, — а серверная оболочка
// текущего адреса не видит (middleware заголовков не ставит).
//
// Всё остальное здесь обычное: одна форма, одно серверное действие.
import { usePathname, useSearchParams } from "next/navigation";
import { clearRoleViewAction } from "@/app/(app)/view-actions";

export function ViewBar({ roleLabel }: { roleLabel: string }) {
  // Возвращаем не только путь, но и запрос: на экране мог быть выбран день,
  // фильтр или открытая шторка — терять их незачем.
  const path = usePathname();
  const q = useSearchParams().toString();
  const here = q ? `${path}?${q}` : path;
  return (
    <form action={clearRoleViewAction} className="view-bar">
      <input type="hidden" name="here" value={here} />
      <span className="view-bar-t">
        Вы смотрите как {roleLabel}: кнопки и пути его. Это просмотр — ничего не сохраняется
      </span>
      <button className="aui-btn aui-btn--ghost aui-btn--sm" type="submit">Вернуться к своей роли</button>
    </form>
  );
}
