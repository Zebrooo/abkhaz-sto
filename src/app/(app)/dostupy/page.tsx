import Link from "next/link";
import { countPending } from "@/lib/bookings";
import { requireSection } from "@/lib/context";
import { fetchMembers, type StoMember } from "@/lib/api/members";
import { getServerUser } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { ScreenHead } from "@/components/ScreenHead";
import { Sheet } from "@/components/Sheet";
import { STO_ROLE_ACCESS, STO_ROLE_LABEL, type StoRole } from "@/lib/access";
import { formatPhone, initials } from "@/lib/format";
import { inviteMemberAction, setMemberActiveAction, setMemberRoleAction } from "@/app/(app)/staff-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const INVITE_FORM = "invite";
/** Роли, которые назначает хозяин; сам он — вне списка, владение не передаётся. */
const STAFF_ROLES: readonly StoRole[] = ["master", "admin"];

/** «+7 940 700-01-01 · полный доступ» — телефон и состояние одной строкой. */
function subText(m: StoMember): string {
  const tail = m.role === "owner" ? "полный доступ" : m.active ? "" : "доступ выключен";
  return [formatPhone(m.phone), tail].filter(Boolean).join(" · ");
}

/**
 * «Доступы» — кто и что видит в приложении. Список ведёт сайт; здесь
 * хозяин переключает роль (мастер/админ), выключает доступ и приглашает по
 * номеру. Пока маршрута на сайте нет, в списке только сам хозяин — из
 * контекста и учётки: список без единого человека выглядел бы как поломка.
 */
export default async function AccessPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = (await requireSection("access"))!;
  const { shop } = ctx;
  const pending = await countPending(shop.id);
  const res = await fetchMembers(shop.id, ctx.userId);
  // not_found — сотрудников ещё не заводили, пусто честно. Любой другой отказ
  // — сайт молчит, и пустой список выглядел бы как «всех уволили».
  const siteErr = !res.ok && res.code !== "not_found" ? `Сайт пока не отдаёт сотрудников: ${res.error}` : "";
  let members = res.ok ? res.data : [];
  if (members.length === 0) {
    const user = await getServerUser();
    const name = typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim()
      : "Владелец витрины";
    members = [{ userId: ctx.userId, name, phone: user?.phone ?? null, role: "owner", masterId: null, active: true, canRemove: false, addedAt: "" }];
  }

  const act = pick(sp.do);
  const roleRaw = pick(sp.role);
  const inviteRole: StoRole = roleRaw === "admin" ? "admin" : "master";
  const inviteHref = (role: StoRole) => `/dostupy?do=invite&role=${role}`;

  return (
    <>
      <ScreenHead title="Доступы" sub="кто и что видит в приложении" back="/menu" unread={pending} />
      <div className="page page-access stack">
        <div className="head">
          <div>
            <div className="head-t">Доступы</div>
            <div className="head-s">Роль решает, что человек видит. Вход — по номеру телефона, как на сайте.</div>
          </div>
          <div className="head-tail">
            <Link className="aui-btn aui-btn--primary aui-btn--md acc-invite-web" href={inviteHref("master")}>Пригласить по номеру</Link>
          </div>
        </div>

        <Flash ok={pick(sp.ok)} err={pick(sp.err) || siteErr} />

        <p className="hint acc-note-top">Роль решает, что человек видит: мастер — свой пост и осмотры, админ — записи и клиентов, хозяин — деньги и настройки. Вход — по номеру телефона, как на сайте.</p>

        <div className="acc-list">
          {members.map(m => {
            const owner = m.role === "owner";
            return (
              <div key={m.userId} className={`acc-row${!owner && !m.active ? " off" : ""}`}>
                <span className="ava ava-accent">{initials(m.name)}</span>
                <div className="row-main">
                  <div className="acc-n">{m.name}</div>
                  <div className="acc-s">{subText(m)}</div>
                </div>
                {owner ? (
                  <span className="rspec is-accent">владелец</span>
                ) : (
                  <>
                    {/* Сегмент — форма: роль меняется одним нажатием, без «Сохранить». */}
                    <form action={setMemberRoleAction} className="acc-seg">
                      <input type="hidden" name="userId" value={m.userId} />
                      <div className="seg">
                        {STAFF_ROLES.map(r => (
                          <button key={r} type="submit" name="role" value={r} aria-pressed={m.role === r}>{STO_ROLE_LABEL[r]}</button>
                        ))}
                      </div>
                    </form>
                    <form action={setMemberActiveAction} className="acc-sw">
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="active" value={m.active ? "0" : "1"} />
                      <button className="sw" type="submit" aria-pressed={m.active} aria-label={m.active ? "Выключить доступ" : "Включить доступ"}>
                        <span />
                      </button>
                    </form>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Link className="aui-btn aui-btn--primary aui-btn--lg acc-invite" href={inviteHref("master")}>Пригласить по номеру</Link>
        <p className="hint">Приглашение уходит по SMS. Хозяин в сервисе один — передать владение может поддержка площадки.</p>
      </div>

      {act === "invite" && (
        <Sheet
          closeHref="/dostupy"
          title="Пригласить по номеру"
          sub="приглашение уйдёт по SMS"
          footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={INVITE_FORM}>Пригласить</button>}
        >
          <form id={INVITE_FORM} action={inviteMemberAction} className="sheet-stack">
            <label className="fld">
              <span>Телефон</span>
              <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 940 000-00-00" required />
            </label>
            <label className="fld">
              <span>Имя</span>
              <input name="name" placeholder="Как записать в списке" maxLength={80} />
            </label>
            <div className="fld">
              <span>Роль</span>
              <div className="seg">
                {STAFF_ROLES.map(r => (
                  <Link key={r} href={inviteHref(r)} aria-pressed={inviteRole === r}>{STO_ROLE_LABEL[r]}</Link>
                ))}
              </div>
            </div>
            <input type="hidden" name="role" value={inviteRole} />
            <p className="sheet-note">{STO_ROLE_LABEL[inviteRole]} — {STO_ROLE_ACCESS[inviteRole]}.</p>
          </form>
        </Sheet>
      )}
    </>
  );
}
