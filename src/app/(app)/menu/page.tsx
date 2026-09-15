import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { currentServiceShop } from "@/lib/shop";
import { listServices } from "@/lib/services";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHead } from "@/components/ScreenHead";
import { count } from "@/lib/format";
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

/**
 * «Ещё» — то, что не попало во вкладки: прайс, расписание, лента и витрина
 * на сайте. Подписи с живыми цифрами: по ним видно состояние сервиса, не
 * заходя внутрь. На вебе эти разделы стоят в левом меню, экран нужен
 * телефону, но выглядит одинаково.
 */
export default async function MorePage() {
  const shop = (await currentServiceShop())!;
  const services = await listServices(shop.id);
  const pending = await countPending(shop.id);

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
          <Row href="/uslugi" icon="wrench" title="Услуги и цены"
            sub={`${count(services.length, "услуга", "услуги", "услуг")} · окна считаются от длительности`} />
          <Row href="/raspisanie" icon="clock" title="Расписание" sub={scheduleLine(shop.schedule)} />
          <Row href="/uvedomleniya" icon="bell" title="Уведомления"
            sub={count(pending, "новая запись", "новые записи", "новых записей")} />
          <Row href={shopStorefrontUrl(shop.id)} icon="shop" title="Витрина на сайте"
            sub="abkhaz-auto.ru · рубрика «Автосервис»" external />
        </div>

        <div className="foot-note">Абхаз-Работа · 1.0 · rabota.abkhaz-auto.ru</div>
      </div>
    </>
  );
}
