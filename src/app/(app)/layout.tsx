import { logoutAction } from "@/app/auth-actions";
import { serviceContext } from "@/lib/context";
import { STO_ROLE_LABEL } from "@/lib/access";
import { ViewBar } from "@/components/ViewBar";
import { AdminBar } from "@/components/AdminBar";
import { countPending } from "@/lib/bookings";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { TopBar } from "@/components/TopBar";
import { PullRefresh } from "@/components/PullRefresh";
import { Icon } from "@/components/Icon";
import { formatPhone, todayLocal } from "@/lib/format";
import { siteUrl, shopStorefrontUrl } from "@/lib/site";
import { getServerUser } from "@/lib/supabase/server";
import { myServiceShops } from "@/lib/shop";

// Все экраны — под одним сервисом текущего пользователя. Нет сервиса —
// объяснение вместо экранов: приложение без витрины бесполезно, и человек
// должен понять, что делать, а не смотреть на пустой календарь.
//
// Объяснений два, и путать их нельзя: гостю нужен вход, а вошедшему без
// витрины — что организации у его номера нет и кто её заводит. Одна
// карточка на оба случая отправляла вошедшего логиниться заново, хотя он
// уже вошёл.
//
// Роль решает, какие вкладки и пункты меню рисовать (lib/nav.ts); что
// разрешено на самом деле, проверяет сайт по actorUserId.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await serviceContext();
  if (!ctx) {
    // Та же карточка по центру экрана, что и на /vhod (.gate): каркас
    // приложения без витрины рисовать нечем, а растянутая на всю ширину
    // карточка с двумя кнопками в 320px разъезжалась.
    const user = await getServerUser();
    const site = siteUrl();
    if (!user) {
      return (
        <main className="gate">
          <div className="card empty">
            <span className="sq"><Icon name="shop" size={26} /></span>
            <div className="empty-t">Нужен вход</div>
            <div className="empty-s">Войдите на сайте Абхаз Авто по номеру телефона, на который зарегистрирована организация, и вернитесь сюда — сессия общая.</div>
            <div className="hero-actions">
              <a className="aui-btn aui-btn--primary aui-btn--md" href={`${site}/vhod?next=/lk`}>Войти на сайте</a>
              <a className="aui-btn aui-btn--ghost aui-btn--md" href="/vhod">Про вход</a>
            </div>
          </div>
        </main>
      );
    }
    const phone = formatPhone(user.phone);
    return (
      <main className="gate">
        <div className="card empty">
          <span className="sq"><Icon name="shop" size={26} /></span>
          <div className="empty-t">Организации нет</div>
          <div className="empty-s">
            {phone ? `У номера ${phone}` : "У вашей учётки"} нет одобренной витрины с рубрикой «Автосервис» или «Товары», поэтому записей, заказов и прайса здесь пока нет.
            Организацию заводит менеджер площадки: телефон и режим работы, прайс или товары — и через 15 минут можно принимать записи и заказы.
          </div>
          <div className="hero-actions">
            <a className="aui-btn aui-btn--primary aui-btn--md" href={`${site}/kontakty`}>Написать менеджеру</a>
            {/* Раньше здесь стояла ссылка «Войти другим номером» на сайт, но
                она никого не выводила: сессия оставалась, сайт открывался
                под тем же номером, и человек возвращался на этот же экран.
                Сначала выход, потом вход — иначе сменить номер нечем. */}
            <form action={logoutAction}>
              <button className="aui-btn aui-btn--ghost aui-btn--md" type="submit">Выйти</button>
            </form>
          </div>
          <p className="hint">Организация есть, но открылась эта страница? Значит, в витрине указан другой номер — выйдите и войдите под ним на сайте, кука сессии общая с abkhaz-auto.ru.</p>
        </div>
      </main>
    );
  }
  const { shop, role } = ctx;
  const kind = shop.kind;
  const day = todayLocal();
  // Главная кнопка: у сервиса — ручная запись, у магазина — заказ по звонку.
  const newHref = kind === "goods" ? "/zakazy/novyi" : `/kalendar/novaya?d=${day}`;
  // «Осмотр» — постоянный адрес /osmotr: куда именно вести (текущая запись,
  // новый осмотр, отчёты) решает сама страница-редиректор, когда по ней
  // перешли. Раньше это считал layout — два HTTP к сайту на каждый рендер.
  // У магазина записей нет — и считать нечего.
  // Список витрин — для переключателя в шапке; myServiceShops кэширован на
  // запрос, контекст его уже спросил, второго похода в базу нет.
  const [pending, shops] = await Promise.all([
    kind === "goods" ? Promise.resolve(0) : countPending(shop.id),
    myServiceShops(),
  ]);
  const choices = shops.map(s => ({ id: s.id, name: s.name, kind: s.kind }));
  return (
    <div className="app">
      {/* Жест «потяни вниз» — на всех экранах приложения разом: он про
          свежесть данных, а не про конкретный экран. */}
      <PullRefresh />
      <TopBar shop={{ id: shop.id, name: shop.name, kind }} kind={kind} role={role} newHref={newHref} unread={pending} shops={choices} />
      {/* ПРИМЕРКА РОЛИ ВИДНА ВСЕГДА. Хозяин, забывший, что смотрит глазами
          мастера, решит, что половина приложения пропала. Полоса висит над
          всеми экранами и уводит обратно одной кнопкой. */}
      {ctx.viewing && <ViewBar roleLabel={STO_ROLE_LABEL[role].toLowerCase()} />}
      {/* Полоса админа сайта — тем же правилом видимости, что примерка:
          в чужой витрине забыть, где стоишь, ещё дороже, чем в чужой роли. */}
      {shop.adminEntry && <AdminBar shopName={shop.name} />}
      <div className="app-body">
        <SideNav kind={kind} role={role} siteUrl={shopStorefrontUrl(shop.id)} unread={pending} />
        <main className="main">{children}</main>
      </div>
      <TabBar kind={kind} role={role} newHref={newHref} />
    </div>
  );
}
