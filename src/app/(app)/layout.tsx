import { currentServiceShop } from "@/lib/shop";
import { NavLinks } from "@/components/NavLinks";

// Все экраны — под одним сервисом текущего пользователя. Нет сервиса —
// объяснение вместо экранов: приложение без витрины бесполезно, и человек
// должен понять, что делать, а не смотреть на пустой календарь.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const shop = await currentServiceShop();
  if (!shop) {
    return (
      <main>
        <div className="card">
          <h2>Сервис не найден</h2>
          <p>У этого номера нет одобренной витрины с рубрикой «Автосервис» на Абхаз Авто.</p>
          <p className="muted small">Витрину заводит менеджер площадки; если она уже есть — проверьте, что вошли под тем же номером, что указан в витрине.</p>
        </div>
      </main>
    );
  }
  return (
    <>
      <header className="top">
        <div className="top-in">
          <div>
            <h1>{shop.name}</h1>
            <div className="sub">{shop.schedule ? `${shop.schedule.posts} ${shop.schedule.posts === 1 ? "пост" : shop.schedule.posts < 5 ? "поста" : "постов"}` : "расписание не задано"}</div>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <NavLinks />
    </>
  );
}
