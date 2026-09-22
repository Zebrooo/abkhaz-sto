import Link from "next/link";
import { createWalkInAction } from "@/app/(app)/osmotr-actions";
import { Flash } from "@/components/Flash";
import { ScreenHead } from "@/components/ScreenHead";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Осмотр без записи. Сюда ведёт вкладка «Осмотр», когда на посту нет текущей
 * записи: раньше она уводила в «Мои работы», и мастер с машиной «с улицы»
 * упирался в пустой экран. Спрашиваем минимум — владельца и машину с VIN;
 * запись «Осмотр» создаётся «сейчас» на свободный пост, дальше обычный
 * осмотр: пробег, дефекты, отчёт. Услугу и окно не спрашиваем: машина уже
 * стоит на подъёмнике, и форма записи из трёх шагов тут — препятствие.
 */
export default async function WalkInPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("inspect"))!;
  const pending = await countPending(ctx.shop.id);
  const v = (k: string) => pick(sp[k]);

  return (
    <>
      <ScreenHead title="Осмотр" sub="машина без записи" back={ctx.role === "master" ? "/moi-raboty" : "/segodnya"} unread={pending} />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Осмотр без записи</div>
            <div className="head-s">машина с улицы · запись «Осмотр» встанет на свободный пост прямо сейчас</div>
          </div>
        </div>

        <Flash ok={v("ok")} err={v("err")} />

        <form action={createWalkInAction} className="card stack">
          <label className="fld">
            <span>Владелец</span>
            <input name="name" defaultValue={v("n")} maxLength={80} placeholder="как зовут" autoComplete="off" required />
          </label>
          <label className="fld">
            <span>Телефон</span>
            <input name="phone" type="tel" defaultValue={v("ph")} maxLength={20} placeholder="+7 940 …" autoComplete="off" />
          </label>
          <label className="fld">
            <span>Машина</span>
            <input name="vehicle" defaultValue={v("v")} maxLength={80} placeholder="марка, модель, год" autoComplete="off" />
          </label>
          <label className="fld">
            <span>Госномер</span>
            <input name="plate" defaultValue={v("pl")} maxLength={12} placeholder="А 123 АВ" autoComplete="off" />
          </label>
          <label className="fld">
            <span>VIN</span>
            <input name="vin" defaultValue={v("vin")} maxLength={20} placeholder="17 знаков — история останется при машине" autoComplete="off" />
          </label>
          <button className="aui-btn aui-btn--primary aui-btn--lg" type="submit">Создать запись и начать осмотр</button>
          <p className="hint">Пробег спросим на самом осмотре. Клиент по телефону, а не у стойки — лучше обычная запись, там выбирается услуга и время.</p>
        </form>

        <div className="stack" style={{ gap: 8 }}>
          {ctx.role === "master" && <Link className="aui-btn aui-btn--outline aui-btn--md" href="/moi-raboty">Мои работы</Link>}
          <Link className="aui-btn aui-btn--outline aui-btn--md" href="/otchety">Готовые отчёты</Link>
        </div>
      </div>
    </>
  );
}
