import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";

/** Шторка подтверждения выхода — открывается адресом, как остальные. */
export const EXIT = "vyhod";
const LOGOUT_FORM = "logout";

/**
 * Выход — отдельной карточкой, а не строкой среди разделов: он уводит из
 * приложения, а не открывает экран. Внизу, где его ищут. Одна разметка на
 * «Ещё» сервиса и магазина: путь выхода один.
 */
export function ExitCard({ me }: { me: string }) {
  return (
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
  );
}

/**
 * Спрашиваем, потому что обратно человек войдёт не кнопкой: вход — на
 * сайте по коду из звонка или SMS, и случайное нажатие стоит сервису
 * простоя у стойки.
 */
export function ExitSheet({ me }: { me: string }) {
  return (
    <Sheet
      closeHref="/menu"
      title="Выйти из приложения"
      sub={me || undefined}
      footer={<button className="aui-btn aui-btn--primary aui-btn--lg" type="submit" form={LOGOUT_FORM}>Выйти</button>}
    >
      <form id={LOGOUT_FORM} action={logoutAction} className="sheet-stack">
        <p className="sheet-note">Записи, заказы, отчёты и отметка на посту никуда не денутся — они на сервере, а не в этом телефоне. Чтобы вернуться, нужно снова войти по номеру телефона: сессия общая с abkhaz-auto.ru, поэтому выход закрывает и сайт на этом устройстве.</p>
      </form>
    </Sheet>
  );
}
