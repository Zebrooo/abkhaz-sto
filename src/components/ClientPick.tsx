"use client";
// Строка «Имя» в ручной записи ищет по тем, кто уже был: по имени, телефону
// и машине — теми же правилами, что и поиск на экране «Клиенты»
// (lib/clients.ts, matchClient), чтобы «Иван» находился одинаково в обоих
// местах. Нашли — одно нажатие, и имя, телефон и машина уже в форме:
// человек за стойкой не перенабирает номер, который у нас и так есть.
//
// Клиентский компонент, потому что подсказки появляются от набора текста, а
// не от перехода по адресу: гонять экран на сервер за каждой буквой в форме,
// где уже выбраны услуга и окно, — терять набранное и мигать экраном.
// Сами поля остаются обычными input с теми же name, что и раньше: отправляет
// их та же серверная форма (createManualAction), своего пути к базе здесь нет.
import { useEffect, useRef, useState } from "react";
import { matchClient } from "@/lib/clients";
import { count, formatPhone } from "@/lib/format";
import type { ClientCar } from "@/lib/vehicles";

/** Клиент из свода по записям — только то, что нужно строке поиска. */
export type KnownClient = {
  key: string;
  name: string;
  phone: string | null;
  car: string | null;
  /** Госномер и VIN последней машины — по ним тоже ищут. */
  plate: string | null;
  vin: string | null;
  /** Все его номера и VIN: клиента ищут и по машине, которую он продал. */
  plates: string[];
  vins: string[];
  visits: number;
  /** Все его машины, свежие сверху: человек приезжает не всегда на одной. */
  cars: ClientCar[];
};

/** Чем заполнить поля сразу: возврат из ошибки или запись «этого же клиента». */
export type ClientPickInitial = {
  name?: string; phone?: string; vehicle?: string; plate?: string; vin?: string;
};

/** Больше горсти подсказок в строку не помещается, да и выбирать из них тяжело. */
const MAX_HINTS = 6;

export function ClientPick({ clients, initial }: { clients: readonly KnownClient[]; initial?: ClientPickInitial }) {
  // Начальные значения приходят из адреса: так форма переживает отказ
  // («VIN — 17 знаков») и так же открывается запись знакомого клиента из его
  // карточки. Дальше поле живёт своей жизнью, перетирать набранное нельзя.
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [vehicle, setVehicle] = useState(initial?.vehicle ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [vin, setVin] = useState(initial?.vin ?? "");
  const [open, setOpen] = useState(false);
  /** Выбранный клиент: под полем машины показываем именно его машины. */
  const [picked, setPicked] = useState<KnownClient | null>(null);
  /** Подсвеченная подсказка для стрелок; -1 — ни одной. */
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = name.trim();
  const found = q.length > 0 ? clients.filter(c => matchClient(c, q)).slice(0, MAX_HINTS) : [];
  // Ровное совпадение с именем выбранного — подсказывать нечего.
  const show = open && found.length > 0 && !(found.length === 1 && found[0].name === name);

  // Нажатие мимо списка закрывает его: подсказки не должны висеть над
  // соседними полями, пока человек заполняет телефон.
  useEffect(() => {
    if (!show) return;
    const away = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [show]);

  function choose(c: KnownClient) {
    setName(c.name);
    setPhone(formatPhone(c.phone));
    setPicked(c);
    // Машину подставляем, только если поля пустые: человек мог уже написать,
    // на чём клиент приехал в этот раз, и затирать это нельзя.
    // Название, номер и VIN берём У ОДНОЙ машины — свежей. Иначе марка была
    // бы от одной, а номер от другой, и в запись уехала бы химера.
    const car = c.cars[0] ?? null;
    if (!vehicle.trim() && (car?.name || c.car)) setVehicle(car?.name ?? c.car ?? "");
    if (car?.plate && !plate.trim()) setPlate(car.plate);
    if (car?.vin && !vin.trim()) setVin(car.vin);
    setOpen(false);
    setCursor(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!show) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((cursor + step + found.length) % found.length);
      return;
    }
    // Enter с подсвеченной подсказкой выбирает её, а не отправляет форму:
    // отправить наполовину заполненную запись по дороге к клиенту обидно.
    if (e.key === "Enter" && cursor >= 0 && cursor < found.length) {
      e.preventDefault();
      choose(found[cursor]);
    }
  }

  return (
    <>
      <div className="fld cli-pick" ref={boxRef}>
        {/* Подпись оставляем span, как у соседних полей (.fld > span): за
            связь с полем отвечает aria-label, потому что обернуть input в
            label вместе с выпадающим списком нельзя — нажатие по подсказке
            попадало бы в поле. */}
        <span>Имя</span>
        <input
          name="name"
          aria-label="Имя клиента"
          required
          maxLength={80}
          autoComplete="off"
          role="combobox"
          aria-expanded={show}
          aria-controls="cli-hints"
          aria-autocomplete="list"
          placeholder={clients.length > 0 ? "имя или телефон — найдём, если уже были" : undefined}
          value={name}
          onChange={e => {
            setName(e.target.value);
            setOpen(true);
            setCursor(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {show && (
          <ul className="cli-hints" id="cli-hints" role="listbox">
            {found.map((c, i) => (
              <li key={c.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={i === cursor ? "at" : undefined}
                  onClick={() => choose(c)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="cli-t">{c.name}</span>
                  <span className="cli-s">
                    {[formatPhone(c.phone), c.car, count(c.visits, "визит", "визита", "визитов")].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="fld">
        <span>Телефон</span>
        <input
          name="phone"
          inputMode="tel"
          placeholder="+7 940 000-00-00"
          autoComplete="off"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Машина</span>
        <input
          name="vehicle"
          maxLength={80}
          placeholder="Toyota Camry 2015"
          autoComplete="off"
          value={vehicle}
          onChange={e => setVehicle(e.target.value)}
        />
      </label>
      {/* Машины выбранного клиента: у человека их бывает несколько, и
          приезжает он не всегда на той, что была в прошлый раз. Чип ставит
          сразу и название, и номер, и VIN — перенабирать их незачем. */}
      {picked && picked.cars.length > 0 && (
        <div className="chips cli-cars">
          {picked.cars.map(c => (
            <button
              key={`${c.name}-${c.plate ?? ""}`}
              type="button"
              className="chip"
              aria-pressed={c.name === vehicle.trim()}
              onClick={() => {
                setVehicle(c.name);
                setPlate(c.plate ?? "");
                setVin(c.vin ?? "");
              }}
            >
              {[c.name, c.plate].filter(Boolean).join(" · ")}
            </button>
          ))}
        </div>
      )}
      {/* НОМЕР И VIN — ОТДЕЛЬНЫМИ ПОЛЯМИ, а не внутри строки «Машина». По ним
          машина узнаётся в следующий визит: номер перебивают и меняют при
          продаже, VIN живёт с кузовом. Оба необязательны — машина с улицы
          приезжает и без документов, — но без них история будет собираться
          по марке и году, то есть ненадёжно. */}
      <div className="fld-row">
        <label className="fld">
          <span>Госномер</span>
          <input
            name="plate"
            maxLength={12}
            placeholder="А 123 АВ 01"
            autoComplete="off"
            autoCapitalize="characters"
            value={plate}
            onChange={e => setPlate(e.target.value)}
          />
        </label>
        <label className="fld">
          <span>VIN</span>
          <input
            name="vin"
            // Вставляют VIN и с пробелами, и с дефисами: режем по факту на
            // сервере, а не обрезаем на 17-м знаке прямо в поле.
            maxLength={25}
            placeholder="17 знаков"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={vin}
            onChange={e => setVin(e.target.value)}
          />
        </label>
      </div>
      <p className="hint cli-vin-hint">VIN — на табличке под лобовым стеклом или в техпаспорте. По нему машина узнаётся, даже когда сменили номер.</p>
    </>
  );
}
