import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { listServices } from "@/lib/services";
import { fetchUnread } from "@/lib/api/chat";
import { fetchReports } from "@/lib/api/reports";
import { listOr } from "@/lib/api/site-api";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { count, todayLocal } from "@/lib/format";
import { inspectHref, masterDay } from "@/lib/master-day";
import { MENU, type MenuKey } from "@/lib/nav";
import { periodRange } from "@/lib/reports";
import { shopStorefrontUrl } from "@/lib/site";
import { STO_DAYS, STO_DAY_LABEL, type StoDay, type StoSchedule } from "@/lib/sto/schedule";

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
export default async function MorePage() {
  const ctx = (await requireSection("bookings"))!;
  const { shop, role } = ctx;
  const keys = MENU[role];
  const day = todayLocal();
  const pending = await countPending(shop.id);
  const services = keys.includes("services") ? await listServices(shop.id) : [];
  // Цифры с сайта — только для строк, которые эта роль увидит: незачем
  // спрашивать непрочитанные у хозяина, у которого чата нет.
  const unread = keys.includes("chats") ? await fetchUnread(shop.id, ctx.userId) : null;
  // Один поход за днём мастера кормит две строки: «Мастера» (кто на смене) и
  // «Мой пост» (где стоите вы сами).
  const mday = keys.includes("masters") || keys.includes("mywork") ? await masterDay(ctx, day) : null;
  const masters = mday?.masters ?? [];
  // Ровно то же окно, что откроется по нажатию (экран «Готовые отчёты»
  // стартует с недели): число в подписи обязано совпасть со списком, иначе
  // строка врёт. Мастеру — только его отчёты, как и на самом экране.
  const reportRange = periodRange("week", day);
  const reports = keys.includes("report")
    ? listOr(await fetchReports({
      shopId: shop.id, actorUserId: ctx.userId,
      masterId: role === "master" && ctx.masterId !== null ? ctx.masterId : undefined,
      from: reportRange.from, to: reportRange.to,
    }))
    : [];
  const inspect = keys.includes("inspect") ? await inspectHref(ctx, day, new Date()) : "";

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

        <div className="card card-flat">
          {keys.map(k => {
            const it = ITEMS[k];
            return <Row key={k} href={it.href} icon={it.icon} title={it.title} sub={it.sub} external={it.external} />;
          })}
        </div>

        <div className="foot-note">АбхазАвто Бизнес · 1.0 · business.abkhaz-auto.ru</div>
      </div>
    </>
  );
}
