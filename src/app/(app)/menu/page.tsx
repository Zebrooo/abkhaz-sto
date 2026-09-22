import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { logoutAction } from "@/app/auth-actions";
import { requireSection } from "@/lib/context";
import { listServices } from "@/lib/services";
import { fetchUnread } from "@/lib/api/chat";
import { fetchReports } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { Flash } from "@/components/Flash";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { count, formatPhone, todayLocal } from "@/lib/format";
import { inspectHref, masterDay } from "@/lib/master-day";
import { MENU, type MenuKey } from "@/lib/nav";
import { STO_ROLE_LABEL, type StoRole } from "@/lib/access";
import { setRoleViewAction } from "@/app/(app)/view-actions";
import { leaveAdminShopAction } from "@/app/(app)/admin-actions";
import { periodRange } from "@/lib/reports";
import { shopStorefrontUrl } from "@/lib/site";
import { getServerUser } from "@/lib/supabase/server";
import { STO_DAYS, STO_DAY_LABEL, type StoDay, type StoSchedule } from "@/lib/sto/schedule";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Шторка подтверждения выхода — открывается адресом, как остальные. */
const EXIT = "vyhod";
const LOGOUT_FORM = "logout";

const dayLab = (d: StoDay) => STO_DAY_LABEL[d].toLowerCase();

/**
 * «пн–пт 09:00–18:00 · 3 поста» — расписание одной строкой. Дни подряд
 * сжимаем в диапазон, вразнобой — перечисляем: человек должен узнать свой
 * график, не открывая экран.
 */
function scheduleLine(schedule: StoSchedule | null): string {
  if (!schedule) return "не задано — с сайта записаться нельзя";
  const work = STO_DAYS.filter(d => schedule.days[d].length > 0);
  const posts = count(schedule.posts, "пост", "поста", "постов");
  if (work.length === 0) return `рабочих дней нет · ${posts}`;
  const last = work[work.length - 1];
  const solid = work.length === STO_DAYS.indexOf(last) - STO_DAYS.indexOf(work[0]) + 1;
  const days = work.length === 1 ? dayLab(work[0])
    : solid ? `${dayLab(work[0])}–${dayLab(last)}`
      : work.map(dayLab).join(", ");
  const from = work.map(d => schedule.days[d][0].from).sort()[0];
  const to = work.map(d => schedule.days[d][schedule.days[d].length - 1].to).sort().reverse()[0];
  return `${days} ${from}–${to} · ${posts}`;
}

function Row({ href, icon, title, sub, external }: { href: string; icon: IconName; title: string; sub: string; external?: boolean }) {
  const body = (
    <>
      <span className="sq"><Icon name={icon} size={18} /></span>
      <div className="row-main">
        <div className="row-t">{title}</div>
        <div className="row-s">{sub}</div>
      </div>
      <span className="chev"><Icon name="chevron" size={16} /></span>
    </>
  );
  return external
    ? <a className="row mrow" href={href} target="_blank" rel="noreferrer">{body}</a>
    : <Link className="row mrow" href={href}>{body}</Link>;
}

type Item = { key: MenuKey; href: string; icon: IconName; title: string; sub: string; external?: boolean };

/**
 * «Ещё» — то, что не попало во вкладки роли (lib/nav.ts, MENU): мастеру
 * осмотр, отчёты, чат и прайс; админу ещё расписание и мастера; хозяину —
 * доступы. Подписи с живыми цифрами: по ним видно состояние сервиса, не
 * заходя внутрь. На вебе эти разделы стоят в левом меню, экран нужен
 * телефону, но выглядит одинаково.
 */
export default async function MorePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("bookings"))!;
  const { shop, role } = ctx;
  const keys = MENU[role];
  const day = todayLocal();
  // Ровно то же окно, что откроется по нажатию (экран «Готовые отчёты»
  // стартует с недели): число в подписи обязано совпасть со списком, иначе
  // строка врёт. Мастеру — только его отчёты, как и на самом экране.
  const reportRange = periodRange("week", day);
  // Цифры с сайта — только для строк, которые эта роль увидит: незачем
  // спрашивать непрочитанные у хозяина, у которого чата нет. Всё независимое
  // уходит одной пачкой — иначе экран ждёт каждый запрос по очереди.
  const [pending, services, unread, mday, reports, inspect, user] = await Promise.all([
    countPending(shop.id),
    keys.includes("services") ? listServices(shop.id) : Promise.resolve([]),
    keys.includes("chats") ? fetchUnread(shop.id, ctx.userId) : Promise.resolve(null),
    // Один поход за днём мастера кормит две строки: «Мастера» (кто на смене) и
    // «Мой пост» (где стоите вы сами).
    keys.includes("masters") || keys.includes("mywork") ? masterDay(ctx, day) : Promise.resolve(null),
    keys.includes("report")
      ? fetchReports({
        shopId: shop.id, actorUserId: ctx.userId,
        masterId: role === "master" && ctx.masterId !== null ? ctx.masterId : undefined,
        from: reportRange.from, to: reportRange.to,
      }).then(listOr)
      : Promise.resolve([]),
    keys.includes("inspect") ? inspectHref(ctx, day, new Date()) : Promise.resolve(""),
    // Под какой учёткой сидит приложение — это и подпись строки выхода, и
    // ответ на «почему я вижу чужой сервис»: номер виден, не выходя.
    getServerUser(),
  ]);
  const masters = mday?.masters ?? [];
  const me = formatPhone(user?.phone) || user?.email || "";

  const unreadLine = !unread?.ok || unread.data.unread === 0
    ? "нет непрочитанных"
    : count(unread.data.unread, "непрочитанное", "непрочитанных", "непрочитанных");
  const mastersLine = masters.length === 0
    ? "мастеров пока нет"
    : `${masters.filter(m => m.active && m.onShift).length} на смене из ${masters.filter(m => m.active).length}`;

  const ITEMS: Record<MenuKey, Item> = {
    mywork: {
      key: "mywork", href: "/moi-raboty", icon: "list", title: "Мой пост",
      sub: mday?.postNo ? `вы на посту ${mday.postNo} · ${count(mday.mine.length, "запись", "записи", "записей")}` : "отметьтесь, какой подъёмник заняли",
    },
    inspect: { key: "inspect", href: inspect, icon: "camera", title: "Осмотр и отчёты", sub: "фото дефекта, узел — и он в отчёте" },
    report: role === "master"
      ? { key: "report", href: "/otchety", icon: "list", title: "Мои отчёты", sub: `${reports.length} за 7 дней` }
      : { key: "report", href: "/otchety", icon: "list", title: "Готовые отчёты", sub: `${reports.length} за 7 дней · весь сервис` },
    services: role === "master"
      ? { key: "services", href: "/uslugi", icon: "wrench", title: "Прайс", sub: `${count(services.length, "услуга", "услуги", "услуг")} · только просмотр` }
      : { key: "services", href: "/uslugi", icon: "wrench", title: "Услуги и цены", sub: `${count(services.length, "услуга", "услуги", "услуг")} · окна считаются от длительности` },
    schedule: { key: "schedule", href: "/raspisanie", icon: "clock", title: "Расписание", sub: scheduleLine(shop.schedule) },
    masters: { key: "masters", href: "/mastera", icon: "users", title: "Мастера", sub: mastersLine },
    clients: {
      key: "clients", href: "/klienty", icon: "users", title: "Клиенты",
      sub: "карточки по записям — имя, телефон, машины и VIN",
    },
    chats: { key: "chats", href: "/chat", icon: "comment", title: "Чат с клиентами", sub: unreadLine },
    notifs: { key: "notifs", href: "/uvedomleniya", icon: "bell", title: "Уведомления", sub: count(pending, "новая запись", "новые записи", "новых записей") },
    access: { key: "access", href: "/dostupy", icon: "cog", title: "Доступы", sub: "мастер · админ · хозяин" },
    shop: { key: "shop", href: shopStorefrontUrl(shop.id), icon: "shop", title: "Витрина на сайте", sub: "abkhaz-auto.ru · рубрика «Автосервис»", external: true },
  };

  return (
    <>
      <ScreenHead title="Ещё" sub="настройки сервиса" unread={pending} />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Ещё</div>
            <div className="head-s">Прайс, часы работы, лента событий и витрина на сайте — то, что не поместилось во вкладки.</div>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />

        <div className="card card-flat">
          {keys.map(k => {
            const it = ITEMS[k];
            return <Row key={k} href={it.href} icon={it.icon} title={it.title} sub={it.sub} external={it.external} />;
          })}
        </div>

        {/* ПРИМЕРКА РОЛИ — только хозяину и только по настоящей роли: примерив
            мастера, он обязан иметь дорогу назад, а мастеру этот блок не
            показывается вовсе. */}
        {ctx.realRole === "owner" && (
          <div className="card mv-roles">
            <div className="card-t">Посмотреть глазами</div>
            <div className="card-s">
              Проверьте, что видит мастер или админ: вкладки, кнопки и адреса станут его.
              Это просмотр: пока вы в чужой роли, ничего не сохраняется — сайт всё равно знает, что это вы,
              и сделал бы по-вашему, а не по примеренной роли.
            </div>
            <div className="chips mv-chips">
              {(["owner", "admin", "master"] as StoRole[]).map(r => (
                <form key={r} action={setRoleViewAction}>
                  <input type="hidden" name="role" value={r} />
                  <button className="chip" type="submit" aria-pressed={role === r}>{STO_ROLE_LABEL[r]}</button>
                </form>
              ))}
            </div>
          </div>
        )}

        {/* Покинуть чужую витрину — админу сайта, вошедшему через /admin-vhod.
            Своей карточкой над выходом: это выход из СЕРВИСА, а не из
            приложения, и путать их нельзя. */}
        {shop.adminEntry && (
          <div className="card card-flat">
            <form action={leaveAdminShopAction}>
              <button className="row mrow row-exit" type="submit">
                <span className="sq sq-accent"><Icon name="arrowRight" size={18} /></span>
                <div className="row-main">
                  <div className="row-t">Покинуть сервис</div>
                  <div className="row-s">вы здесь как админ сайта</div>
                </div>
                <span className="chev"><Icon name="chevron" size={16} /></span>
              </button>
            </form>
          </div>
        )}

        {/* Выход — отдельной карточкой, а не строкой среди разделов: он
            уводит из приложения, а не открывает экран. Внизу, где его ищут. */}
        <div className="card card-flat">
          <Link className="row mrow row-exit" href={`/menu?do=${EXIT}`}>
            <span className="sq sq-accent"><Icon name="arrowRight" size={18} /></span>
            <div className="row-main">
              <div className="row-t">Выйти</div>
              <div className="row-s">{me ? `вы вошли как ${me}` : "закрыть сессию на этом устройстве"}</div>
            </div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </Link>
        </div>

        <div className="foot-note">АбхазАвто Бизнес · 1.0 · business.abkhaz-auto.ru</div>
      </div>

      {/* Спрашиваем, потому что обратно человек войдёт не кнопкой: вход — на
          сайте по коду из звонка или SMS, и случайное нажатие стоит сервису
          простоя у стойки. */}
      {pick(sp.do) === EXIT && (
        <Sheet
          closeHref="/menu"
          title="Выйти из приложения"
          sub={me || undefined}
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={LOGOUT_FORM}>Выйти</button>}
        >
          <form id={LOGOUT_FORM} action={logoutAction} className="sheet-stack">
            <p className="sheet-note">Записи, отчёты и отметка на посту никуда не денутся — они на сервере, а не в этом телефоне. Чтобы вернуться, нужно снова войти по номеру телефона: сессия общая с abkhaz-auto.ru, поэтому выход закрывает и сайт на этом устройстве.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
