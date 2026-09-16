import { serviceContext } from "@/lib/context";
import { countPending } from "@/lib/bookings";
import { inspectHref } from "@/lib/master-day";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { todayLocal } from "@/lib/format";
import { siteUrl, shopStorefrontUrl } from "@/lib/site";

// Все экраны — под одним сервисом текущего пользователя. Нет сервиса —
// объяснение вместо экранов: приложение без витрины бесполезно, и человек
// должен понять, что делать, а не смотреть на пустой календарь.
//
// Роль решает, какие вкладки и пункты меню рисовать (lib/nav.ts); что
// разрешено на самом деле, проверяет сайт по actorUserId.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await serviceContext();
  if (!ctx) {
    // Та же карточка по центру экрана, что и на /vhod (.gate): каркас
    // приложения без витрины рисовать нечем, а растянутая на всю ширину
    // карточка с двумя кнопками в 320px разъезжалась.
    return (
      <main className="gate">
        <div className="card empty">
          <span className="sq"><Icon name="shop" size={26} /></span>
          <div className="empty-t">Сервис не найден</div>
          <div className="empty-s">У этого номера нет одобренной витрины с рубрикой «Автосервис». Витрину заводит менеджер площадки.</div>
          <div className="hero-actions">
            <a className="aui-btn aui-btn--primary aui-btn--md" href={`${siteUrl()}/kontakty`}>Написать менеджеру</a>
            <a className="aui-btn aui-btn--ghost aui-btn--md" href={`${siteUrl()}/vhod?next=/lk`}>Войти другим номером</a>
          </div>
          <p className="hint">Вошли под тем же номером, что указан в витрине? Кука сессии общая с abkhaz-auto.ru.</p>
        </div>
      </main>
    );
  }
  const { shop, role } = ctx;
  const day = todayLocal();
  const pending = await countPending(shop.id);
  const newHref = `/kalendar/novaya?d=${day}`;
  // «Осмотр» ведёт на текущую запись — её ищем один раз здесь, а не в каждой вкладке.
  const inspect = await inspectHref(ctx, day, new Date());
  return (
    <div className="app">
      <TopBar shopName={shop.name} role={role} newHref={newHref} unread={pending} />
      <div className="app-body">
        <SideNav role={role} siteUrl={shopStorefrontUrl(shop.id)} unread={pending} inspectHref={inspect} />
        <main className="main">{children}</main>
      </div>
      <TabBar role={role} newHref={newHref} inspectHref={inspect} />
    </div>
  );
}
