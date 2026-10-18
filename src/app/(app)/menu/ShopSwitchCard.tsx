import { switchShopAction } from "@/app/(app)/shop-actions";
import { Icon } from "@/components/Icon";
import type { ServiceShop } from "@/lib/shop";

const KIND_LABEL = { service: "автосервис", goods: "магазин товаров" } as const;

/**
 * «Ваши витрины» — только когда их больше одной: сервис и магазин под одним
 * номером. Строки — формы серверного действия с кукой (shop-actions.ts); на
 * вебе то же делает список в шапке. Одной витрине карточка не нужна.
 */
export function ShopSwitchCard({ shops, currentId }: { shops: readonly ServiceShop[]; currentId: number }) {
  if (shops.length < 2) return null;
  return (
    <>
      <div className="sect">Ваши витрины</div>
      <div className="card card-flat">
        {shops.map(s => (
          <form key={s.id} action={switchShopAction}>
            <input type="hidden" name="shopId" value={s.id} />
            <button className="row mrow" type="submit" aria-current={s.id === currentId ? "true" : undefined} style={{ width: "100%", textAlign: "left" }}>
              <span className={`sq${s.id === currentId ? " sq-accent" : ""}`}><Icon name={s.kind === "goods" ? "box" : "wrench"} size={18} /></span>
              <div className="row-main">
                <div className="row-t">{s.name}</div>
                <div className="row-s">{KIND_LABEL[s.kind]}{s.id === currentId ? " · сейчас открыта" : ""}</div>
              </div>
              <span className="chev"><Icon name="chevron" size={16} /></span>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
