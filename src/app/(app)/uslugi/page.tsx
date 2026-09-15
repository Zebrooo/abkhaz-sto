import { currentServiceShop } from "@/lib/shop";
import { listServices } from "@/lib/services";
import { Flash } from "@/components/Flash";
import { MAX_STO_DURATION_MIN, MIN_STO_DURATION_MIN } from "@/lib/sto/types";
import { saveServiceAction } from "@/app/(app)/actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ServicesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shop = (await currentServiceShop())!;
  const services = await listServices(shop.id);
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://abkhaz-auto.ru").replace(/\/$/, "");
  return (
    <>
      <Flash ok={pick(sp.ok)} err={pick(sp.err)} />
      <div className="card">
        <h2>Услуги и цены</h2>
        <p className="muted small">Услуги — это объявления витрины на сайте. Здесь правятся цена и длительность (от неё считаются окна записи). Добавить услугу или типовой прайс — в кабинете витрины на сайте.</p>
        <a className="btn btn-sm" href={`${site}/lk/magaziny/${shop.id}/vitrina?tab=listings`}>Открыть витрину на сайте</a>
      </div>
      {services.length === 0 && <div className="card muted">Услуг пока нет.</div>}
      {services.map(s => (
        <form key={s.listingId} action={saveServiceAction} className="card">
          <input type="hidden" name="shopId" value={shop.id} />
          <input type="hidden" name="listingId" value={s.listingId} />
          <div className="row">
            <span className="title">{s.title}</span>
            {s.status !== "active" && <span className="badge">{s.status === "pending" ? "на модерации" : "скрыта"}</span>}
          </div>
          <div className="fld-inline" style={{ marginTop: 8 }}>
            <label className="fld"><span>Цена, {s.currency}</span><input type="number" name="price" min={0} step={1} defaultValue={s.price ?? ""} placeholder="договорная" /></label>
            <label className="fld"><span>Длительность, мин</span><input type="number" name="durationMin" min={MIN_STO_DURATION_MIN} max={MAX_STO_DURATION_MIN} step={5} defaultValue={s.durationMin} required /></label>
          </div>
          <button className="btn btn-sm" type="submit">Сохранить</button>
        </form>
      ))}
    </>
  );
}
