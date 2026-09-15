import { currentServiceShop } from "@/lib/shop";
import { countPending } from "@/lib/bookings";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { todayLocal } from "@/lib/format";
import { siteUrl, shopStorefrontUrl } from "@/lib/site";

// Все экраны — под одним сервисом текущего пользователя. Нет сервиса —
// объяснение вместо экранов: приложение без витрины бесполезно, и человек
// должен понять, что делать, а не смотреть на пустой календарь.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const shop = await currentServiceShop();
  if (!shop) {
    return (
      <div className="app">
        <main className="main">
          <div className="page stack">
            <div className="card">
              <div className="empty">
                <span className="sq"><Icon name="shop" size={26} /></span>
                <div className="empty-t">Сервис не найден</div>
                <div className="empty-s">У этого номера нет одобренной витрины с рубрикой «Автосервис». Витрину заводит менеджер площадки.</div>
                <div className="hero-actions" style={{ maxWidth: 320 }}>
                  <a className="aui-btn aui-btn--primary aui-btn--md" href={`${siteUrl()}/kontakty`}>Написать менеджеру</a>
                  <a className="aui-btn aui-btn--ghost aui-btn--md" href={`${siteUrl()}/vhod?next=/lk`}>Войти другим номером</a>
                </div>
              </div>
            </div>
            <p className="hint">Вошли под тем же номером, что указан в витрине? Кука сессии общая с abkhaz-auto.ru.</p>
          </div>
        </main>
      </div>
    );
  }
  const pending = await countPending(shop.id);
  const newHref = `/kalendar/novaya?d=${todayLocal()}`;
  return (
    <div className="app">
      <TopBar shopName={shop.name} newHref={newHref} unread={pending} />
      <div className="app-body">
        <SideNav siteUrl={shopStorefrontUrl(shop.id)} unread={pending} />
        <main className="main">{children}</main>
      </div>
      <TabBar newHref={newHref} />
    </div>
  );
}
