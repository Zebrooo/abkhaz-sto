import { ScreenHead } from "@/components/ScreenHead";
import { Flash } from "@/components/Flash";
import type { ServiceContext } from "@/lib/context";
import { formatPhone } from "@/lib/format";
import { getServerUser } from "@/lib/supabase/server";
import { EXIT, ExitCard, ExitSheet } from "@/app/(app)/menu/Exit";

type Query = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** «Ещё» магазина товаров. Пока — только выход; строки появятся вместе с экранами магазина. */
export async function GoodsMenu({ ctx, sp }: { ctx: ServiceContext; sp: Query }) {
  void ctx;
  const user = await getServerUser();
  const me = formatPhone(user?.phone) || user?.email || "";
  return (
    <>
      <ScreenHead title="Ещё" sub="настройки магазина" />
      <div className="page stack">
        <div className="head">
          <div>
            <div className="head-t">Ещё</div>
            <div className="head-s">Витрина на сайте, подписка и выход — то, что не поместилось во вкладки.</div>
          </div>
        </div>
        <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
        <ExitCard me={me} />
        <div className="foot-note">АбхазАвто Бизнес · 1.0 · business.abkhaz-auto.ru</div>
      </div>
      {pick(sp.do) === EXIT && <ExitSheet me={me} />}
    </>
  );
}
