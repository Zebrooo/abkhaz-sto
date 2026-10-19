# `/api/sto/*` — сущности приложения автосервиса

Что приложение просит у сайта и в каком виде ждёт ответ. Это заявка на
реализацию в `djonua/abkhaz-auto`: клиентская сторона уже написана
(`src/lib/api/*`), маршрутов на сайте ещё нет.

## Зачем так

Схемы БД у приложения нет и не будет (`AGENTS.md`). Записи и витрины оно
читает из общей базы под сервисным ключом после проверки владения, а всего
остального — мастеров, ролей, осмотра, отчётов, заметок о клиентах, денег,
чата — в схеме не существует. Заводить их второй миграционной веткой в ту же
базу нельзя: два источника миграций на один Postgres расходятся молча.
Поэтому новые сущности живут на сайте и приезжают сюда по HTTP.

## Общее для всех маршрутов

**Auth** — Ed25519 service-ticket в заголовке `x-service-ticket`
(`@zebrooo/service-ticket`), как у promo-bff и у существующего
`POST /api/sto/booking-event`: приложение подписывает `STO_TICKET_PRIVATE_KEY`
(`src = abkhaz-sto`, `dst = abkhaz-auto`), сайт проверяет
`STO_TICKET_PUBLIC_KEY`, допустимые `src` — из `STO_ALLOWED_SRC`.

Тикет подтверждает, что запрос пришёл **из приложения**, а не **кто** его
сделал. Поэтому в каждом вызове есть `shopId` и `actorUserId`, и сайт обязан
проверить оба:

1. сервис принадлежит `actorUserId` — по `shops.user_id` или подтверждённому
   телефону учётки (`shop-owner.ts`), ровно как в `booking-event`;
2. роль `actorUserId` в этом сервисе позволяет то, что он просит.

Права проверяет сайт, а не приложение: клиентская проверка роли — это
подсказка для интерфейса, а не граница доступа.

**Формат ответа** — `{ "data": … }` при удаче, `{ "error": { "code", "message" } }`
при отказе, коды и статусы — существующие (`src/lib/api/errors.ts`):
`unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `validation_error` 400
· `conflict` 409 · `rate_limited` 429 · `internal` 500.

**Таймауты приложения**: чтение 3 с, запись 8 с. Ответ дольше — для экрана то
же, что недоступность.

**Время** — ISO-8601. Границы периодов (`from`, `to`) — по часам сервиса,
Europe/Moscow фиксированным `+03:00`, как везде в записи на СТО.

**not_found — нормальное состояние.** У нового сервиса нет ни мастеров, ни
осмотров, ни заметок. Приложение такой ответ не логирует и рисует пустое
состояние раздела.

---

## Роли и доступы

Роли три: `master` · `admin` · `owner`. Владелец витрины — всегда `owner`,
эта роль не хранится строкой и не отзывается: иначе сервис останется без
хозяина. Он же обязан приходить в списке первым с `canRemove: false`.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /members/mine?actorUserId` | любому вошедшему | `{ shopId, role, masterId, active }[]` — сервисы, где он сотрудник |
| `GET /members?shopId&actorUserId` | `owner` | `StoMember[]` |
| `POST /members/invite` | `owner` | `{ shopId, actorUserId, phone, role, name? }` → `{ userId, pending }` |
| `POST /members/role` | `owner` | `{ shopId, actorUserId, userId, role }` → `StoMember` |
| `POST /members/active` | `owner` | `{ shopId, actorUserId, userId, active }` → `StoMember` |

```ts
StoMember = { userId, name, phone, role, masterId, active, canRemove, addedAt }
```

Приглашение по телефону: учётки может не быть — тогда `userId: null`,
`pending: true`, и роль включается, когда человек войдёт этим номером.
Номер нормализуется тем же `normalizePhone`, что и везде.

`/members/mine` — единственный вызов **без `shopId`**: сервис ещё не выбран,
приложение только входит. Владелец находит свою витрину по владению
(`lib/shop.ts`, как `shop-owner.ts`), а мастер и админ витрины не имеют — без
этого списка они упирались бы в «сервис не найден». Владельца в ответе нет:
его роль не хранится строкой. Сайт обязан отдавать только витрины со
`status = approved` и рубрикой `service`; приложение это перепроверяет.

`active: false` — уволенный: приложение не пускает его в сервис вовсе, а не
сужает роль. Записи оно читает из общей базы напрямую, и «мастер без поста»
всё равно видел бы все записи с телефонами клиентов.

**Пока маршрута `/members/mine` нет**, в списке только свои витрины и роль у
всех `owner` — ровно сегодняшнее поведение, прав оно не расширяет.

### Админ сайта — владелец в любой витрине

Спека — abkhaz-auto, `docs/superpowers/specs/2026-09-22-sto-admin-access-design.md`.
Полному админу площадки (`profiles.is_admin`) сайт выдаёт роль `owner` в
любой одобренной витрине-сервисе прямо в `resolveStoActor` — то есть каждый
маршрут `/api/sto/*` пускает его владельцем, хотя в `sto_members` его нет и в
`/members/mine` он не приходит (владельцы не видят сотрудников сайта у себя в
«Доступах»).

Вход в конкретную витрину — `GET /admin-vhod?shopId=` этого приложения (кнопка
«Войти в СРМ» в админке сайта, `/admin/shops`): маршрут сверяет `is_admin` по
общей базе, кладёт куку `sto-admin-shop` (`shopId|userId`, httpOnly, сутки) и
уводит на `/svodka`. Дальше витрину из куки первой отдаёт `lib/shop.ts` —
хозяйской, но БЕЗ закрепления `user_id`, — а `is_admin` перечитывается на
каждый запрос: кука переживает отзыв прав, а права — нет. Поверх всех экранов
висит полоса «вы как админ сайта» (`components/AdminBar.tsx`); выход — кнопка
полосы или «Покинуть сервис» в «Ещё».

### Просьба: связать учётку со строкой мастера

`StoMember.masterId` в ответе есть, а поставить его нечем: `POST /members/invite`
принимает только телефон и роль, `POST /masters` — только имя, специальность и
пост (`userId?` в теле есть, но экран его не шлёт, потому что выбрать учётку
хозяину негде). Из-за этого `ctx.masterId` у всех `null`, и приглашённый мастер
работает (отметка на подъёмнике, осмотр, отчёт), но в отчёте остаётся без имени,
а привязки записи к мастеру ему не достаются.

Нужен один из двух маршрутов — любой, какой сайту удобнее:

| Маршрут | Кому | Что |
|---|---|---|
| `POST /members/master` | `owner` | `{ shopId, actorUserId, userId, masterId \| null }` → `StoMember` |
| или поле `masterId` в `POST /members/role` | `owner` | тем же телом, что и роль |

Требования: одна учётка — не больше одной строки мастера в сервисе, и наоборот;
`masterId: null` связь снимает; чужую строку мастера (другого сервиса) сайт не
принимает. Приложение тогда покажет в «Доступах» выбор «кто это из мастеров», а
в «Мастерах» — чья это учётка.

---

## Снимок машины в записи: VIN

`StoBookingVehicleSnapshot` получил необязательное поле `vin`:

```ts
StoBookingVehicleSnapshot = { brand, model, year, plate, vin? }
```

Миграция не нужна — снимок лежит в уже существующем `data` jsonb. Но
`src/lib/sto/types.ts` — **копия модуля сайта**, и та же правка обязана
уехать в `abkhaz-auto` тем же текстом, иначе виджет записи и приложение
начнут писать разные снимки.

**Зачем.** Номер перебивают и меняют вместе с продажей, а «Лада Веста 2021»
в городе не одна: без VIN история ремонта собирается по марке и году, то есть
ненадёжно. Приложение спрашивает VIN и госномер отдельными полями при ручной
записи и сравнивает машины сначала по VIN, потом по номеру
(`src/lib/vehicle-input.ts`, `src/lib/vehicles.ts`).

**Просьба к виджету записи на сайте:** когда клиент выбрал машину из гаража,
класть в снимок `plate` и `vin` так же. Иначе у записей с сайта VIN будет
виден только через `vehicle_id`, а у ручных — только из своего поля, и две
записи одной машины не склеятся.

**Просьба к `/api/sto/booking-event`:** при `event: "created"` и `source: "app"`
сайт может сам достроить строке `client_id` по `data.client.phone` и
`vehicle_id` по `data.vehicle.vin` (иначе по номеру) внутри гаража найденной
учётки. Тело события расширять не нужно — снимок уже лежит в строке, сайт
читает её по `bookingId`. Так приложению не нужен маршрут «найди учётку по
телефону», то есть не появляется новый способ достать чужие данные.

---

## Мастера

Мастер и сотрудник — разные вещи. Мастер может не иметь учётки (`userId: null`):
он есть в расписании и отчётах, но в приложение не входит.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /masters?shopId&actorUserId` | `admin`, `owner` | `StoMaster[]` |
| `GET /masters/load?shopId&actorUserId&from&to` | `admin`, `owner` | `MasterLoad[]` |
| `POST /masters` | `owner` | создать |
| `POST /masters/update` | `owner`; имя, специальность, пост и смену — и `admin`; свою строку (`postNo`, `onShift`, имя, специальность) — сам мастер, см. ниже | патч → `{ master, orphaned }` |
| `GET /masters/bookings?shopId&actorUserId&from&to` | любому своему | `{ bookingId, masterId }[]` |
| `POST /masters/assign` | `admin`, `owner` | `{ …, bookingId, masterId \| null }` |

```ts
StoMaster = { id, name, speciality, userId, postNo, onShift, active }
MasterLoad = { masterId, busySlots, totalSlots, jobs, revenue }
```

Привязка мастера к записи — **отдельной таблицей**, а не колонкой в
`sto_bookings`: запись принадлежит схеме записи на СТО, её форму согласуют
сайт и виджет, и приложению там места нет.

**Пост — физическое место, мастер — человек на записи.** Пост убрать нельзя:
двойную запись на одно место в одно время не пропускает ограничение самой
базы (`exclude using gist` по `shop_id, post_no, tstzrange`), и это
единственная защита от гонки, когда два админа жмут «Записать» одновременно.
Исключение — записи с `overlap_ok` (осознанное наложение из приложения,
подтверждённое попапом): они из ограничения выведены.
Мастер такой гарантии не даёт — он уходит на другой пост, болеет, меняется в
обед.

Отсюда поведение при `onShift: false` или `active: false`: **записи мастера
остаются на своих постах** и ждут нового исполнителя. Убрать вместе с ним
занятые окна значило бы молча потерять пришедших клиентов. Ответ несёт
`orphaned` — номера записей, оставшихся без мастера; экран показывает их
сразу после переключателя.

Автор отчёта — мастер **записи**, а не тот, кто сегодня стоит на посту: за
день на посту могут смениться двое.

### Просьба: правку мастера — и админу

Сейчас всё, кроме `onShift`, правит только `owner`. За стойкой это мешает:
опечатку в имени и перестановку человека на другой подъёмник делает админ,
и дёргать ради этого хозяина незачем. Просьба разрешить `admin` патчить
`name`, `speciality` и `postNo`.

`active` (уволить и вернуть в штат) остаётся за `owner` — это решение о
человеке, а не о сегодняшней смене. Приложение уже так и показывает: кнопка
«Уволить» видна только хозяину, остальное — обоим.

### Мастер отмечается сам

Двое мастеров работают в одно время на разных подъёмниках, и «чья это
машина» решается не заранее, а утром, когда каждый занял свой пост. Поэтому
мастер отмечается сам, а не ждёт, пока хозяин раздаст посты.

Своего маршрута у этого пока нет, и приложение обходится тем, что есть:
`POST /masters/update` **со своей строкой** — `postNo` и `onShift` про себя.
Сейчас поле `postNo` правит только `owner`; просьба к сайту — **разрешить
мастеру и админу менять `postNo` и `onShift` в СВОЕЙ строке** (`masterId`
той строки, чей `userId` равен `actorUserId`). Чужую строку по-прежнему
правит только хозяин: это он снимает со смены и переставляет людей.

Пока сайт этого не умеет — и пока `GET /masters` вообще не отвечает —
отметка живёт в куке устройства (`src/lib/post-cookie.ts`, кука `sto-post`:
сервис, учётка, день, номера постов со временем и номера принятых записей).
Кука — местный запасной путь, а не вторая база: приложение всё равно
best-effort шлёт `masters/update`, чтобы хозяин видел, кто где стоит.

**Чей это пост в момент записи** — три источника, в порядке силы:

1. запись **принята** этим человеком (он начал по ней осмотр) — она его до
   конца работы, даже если её перенесут на другой подъёмник;
2. **привязка** `masters/assign` — админ назначил исполнителя явно;
3. **пост**: по умолчанию машина достаётся мастеру своего поста. Пост берётся
   из сегодняшних отметок **со временем**, а не из `postNo` справочника:
   иначе переход на другой подъёмник в обед задним числом переписал бы утро.
   Мастер, который не отмечался, живёт по `postNo` из справочника.

---

## Осмотр и дефекты

Главное правило, из которого следует модель: **мастер не отмечает норму**. В
осмотре есть только найденное, всё остальное уходит в отчёт как «проверено и
в норме». Поэтому состояния «ок» у узла нет и чек-листа нет.

Узлы — закрытый словарь из восьми ключей, он живёт в приложении
(`src/lib/inspection-nodes.ts`) и меняется вместе с его версией:
`brakes · susp · tires · engine · fluids · steer · elec · body`.
Переименование ключа осиротит написанные отчёты.

Срочность — `bad` (критично) и `warn` (внимание). Третьей нет.

**Цены мастер не назначает.** Формулировка дефекта привязана к строке прайса
витрины, и вместе с ней приезжают работа, длительность и цена. Работы в
прайсе нет — `price: null`, в смете это «договорная», согласование уходит
админу.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /inspections?shopId&actorUserId&bookingId` | `master`, `admin`, `owner` | `Inspection` |
| `GET /inspections/summary?shopId&actorUserId&from&to` | те же | `InspectionSummary[]` |
| `POST /inspections/start` | `master`, `admin`, `owner` | идемпотентно: повтор отдаёт начатый |
| `POST /inspections/finish` | `master`, `admin`, `owner` | `{ …, inspectionId }` → `Inspection` со `status: "finished"` |
| `POST /inspections/odometer` | `master`, `admin`, `owner` | `{ …, inspectionId, odometerKm }` → `Inspection` |
| `POST /inspections/defects` | `master`, `admin`, `owner` | `Defect` |
| `POST /inspections/defects/update` | `master`, `admin`, `owner` | `Defect` |
| `POST /inspections/defects/remove` | `master`, `admin`, `owner` | `{ removed: true }` |
| `GET /inspections/presets?shopId&actorUserId&nodeKey?` | `master`, `admin`, `owner` | `DefectPreset[]` |
| `GET /inspections/presets/frequent?shopId&actorUserId&limit` | те же | `DefectPreset[]` |
| `POST /inspections/photo-upload` | `master`, `admin`, `owner` | `{ photoId, uploadUrl, expiresAt }` |

**Хозяин осматривает наравне с мастером.** В сервисе на два подъёмника он сам
принимает машину и сам снимает дефекты — отказывать ему в записи осмотра
значит оставить сервис без отчётов. Право «смотреть» и право «писать» здесь
не расходятся: читать осмотр `owner` мог всегда.

`masterId` в `/inspections/start` — необязательное поле, и «необязательное»
здесь значит «поля может не быть», а не «поле со значением `null`». Осмотр
начал админ или хозяин — своего поста у него нет, и приложение ключ не
кладёт вовсе; сайт обязан принять такой запрос и записать осмотр без мастера.

### Завершение осмотра — отдельной кнопкой

`status: "finished"` ставит **только** `POST /inspections/finish`, и зовёт его
кнопка «Завершить осмотр» у мастера. Не отправка отчёта и не «само закроется»:
мастеру нужен момент, после которого список дефектов застыл, — отчёт клиенту
уезжает ровно тот, который он собрал.

- Идемпотентно: повтор отдаёт уже завершённый осмотр, а не `conflict`. Кнопку
  жмут дважды с телефона в яме.
- После завершения `POST /inspections/defects`, `/defects/update`,
  `/defects/remove` и `/inspections/odometer` отвечают `409 conflict` —
  приложение эти кнопки и не показывает, но граница на сайте.
- `finishedAt` — момент завершения; он попадает в отчёт как «дата осмотра».
- Отправка отчёта завершённым осмотром не управляет: `with_admin` и
  `with_client` живут своей жизнью.

### Правка пробега

`POST /inspections/odometer` — исправить цифру, вписанную на приёмке в спешке.
Она уезжает клиенту в отчёт и в историю машины, поэтому исправлять её можно,
**пока осмотр не завершён**; у завершённого — `409 conflict`.

- Проверка та же, что при старте: пробег, уехавший назад по этой машине, —
  `validation_error`.
- Сайт пишет в историю осмотра, **кто и когда** поправил: это «исправлено», а
  не «как было». Клиенту в отчёте — только итоговое число.

**Пробег обязателен и спрашивается в начале каждого осмотра.** Не тянется из
прошлого отчёта: между визитами машина ездит, подставленный пробег сделал бы
отчёт неправдивым — а его читает клиент, и по нему назначают следующее ТО.
Сайт сверяет введённое с прошлым по этой машине и отвечает
`validation_error`, если пробег уехал назад: это опечатка, принимать её молча
нельзя. Повторный `start` отдаёт уже начатый осмотр и пробег не
перезаписывает.

```ts
Inspection = { id, bookingId, masterId, masterName, odometerKm,
               status: "draft" | "finished", defects: Defect[], createdAt, finishedAt }
Defect     = { id, nodeKey, title, severity, work, price, durationMin,
               note, photos: { id, url, width, height }[], createdAt }
DefectPreset = { id, nodeKey, title, severity, work, price, durationMin, own, uses }
InspectionSummary = { bookingId, inspectionId, status, badCount, warnCount, total }
```

`POST /inspections/defects/update` принимает `photoIds` **полным списком**, а не добавкой: приложение читает текущие фото, дописывает новый id и шлёт все. Убрать кадр — тот же вызов без него.

`POST /inspections/defects` принимает либо `presetId` (работа и цена приезжают
из прайса), либо свою формулировку — `title`, `severity`, `work`, при
необходимости `listingId`. Свою формулировку сайт **сохраняет в каталог узла**:
в следующий раз это готовый пункт списка, и он начинает копить счётчик.

`uses` — сколько раз формулировку добавляли за 90 дней. По нему строится
строка «вы добавляете чаще всего». У нового сервиса своей статистики нет —
`/presets/frequent` отдаёт стартовый набор по типу работ, и приложению эта
разница не видна.

**Фото** идут в хранилище напрямую из браузера по одноразовому адресу:
мастер снимает несколько кадров подряд с телефона в яме, и перегон мегабайтов
через контейнер приложения — это только задержка. `uploadUrl` живёт не меньше
пяти минут, `url` в ответе `Defect` — подписанный, не меньше часа.

---

## Отчёт по диагностике

Один осмотр — один отчёт, номер общий с записью (`Д-812`).

Путь отчёта: `draft` → `with_admin` → `with_client`. У мастера нет права
отправлять клиенту — он передаёт администратору, и `POST /reports/send`
решает по роли `actorUserId`, какой это шаг.

**Хозяин работает наравне.** В сервисе на два подъёмника он сам осматривает
машину, сам правит смету и сам отправляет отчёт клиенту, поэтому `owner`
назван в `/reports/item` и `/reports/send` явно. Приложение показывает ему эти
кнопки (`src/lib/access.ts`) — если сайт возьмёт список ролей буквально без
`owner`, сломается ровно та роль, под которой сегодня работают все.

**Записывать на найденную работу мастеру нельзя.** `POST /reports/book-item`
остаётся за стойкой (`admin`, `owner`), поэтому приложение и кнопку «Записать
на эту работу» мастеру не показывает: иначе он создал бы запись, которая не
привязалась бы к пункту отчёта, и в календаре осталось бы лишнее окно.

**Смету считает сайт.** Приложение не складывает цены: сумма уходит клиенту и
в деньги сервиса, а две реализации одного сложения рано или поздно разойдутся.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /reports?shopId&actorUserId&inspectionId` | `master`, `admin`, `owner` | `Report` |
| `GET /reports/list?shopId&actorUserId&from&to&masterId?` | те же | `ReportBrief[]` |
| `POST /reports/item` | `master`, `admin`, `owner` | `{ …, defectId, included }` → **весь** `Report` |
| `POST /reports/book-item` | `admin`, `owner` | `{ …, defectId, bookingId }` → `Report` |
| `POST /reports/send` | `master` → админу, `admin` и `owner` → клиенту | `Report` |
| `GET /reports/pdf?shopId&actorUserId&inspectionId` | те же | `{ url, expiresAt }` либо `{ ready: false, retryAfterMs? }` |

**PDF собирается дольше, чем экран ждёт.** Читающие вызовы приложение
обрывает на трёх секундах, а документ со шрифтами и фотографиями в них не
укладывается. Поэтому `/reports/pdf` отвечает одним из двух:

- `{ url, expiresAt }` — готов, приложение уводит по ссылке;
- `{ ready: false, retryAfterMs? }` — собирается. Экран показывает «PDF
  собирается» и кнопку «Проверить ещё раз»; краснеть тут нечему, это не отказ.

Отдавать `202` вместе с `{ ready: false }` можно — приложение смотрит на тело,
а не на код. Чего делать НЕЛЬЗЯ: держать соединение до готовности документа
(приложение оборвёт его и покажет «Сайт сейчас недоступен») или отвечать `500`.

```ts
Report = { inspectionId, bookingId, no, status, car, plate, odometerKm, masterName,
           inspectedAt, defects, okNodeKeys, estimate, bookedCount, total,
           hasNegotiable, totalMin, sentToAdminAt, sentToClientAt }
EstimateItem = { defectId, work, price, durationMin, included, nextBookingId }
```

**«Клиент одобрил пункт» — это запись на следующий сеанс, а не галочка.**
Клиент видит в отчёте, что надо исправить, и берёт время на эту работу;
`nextBookingId` — та самая запись. Состояния два — предложено и записан;
третьего («отказался») нет, потому что от молчания оно неотличимо.

Связь ставит `POST /reports/book-item`. Клиент делает это у себя на сайте, но
чаще — админ у стойки: «нашли колодки, запишем на четверг». Запись он создаёт
обычным путём (приложение пишет в `sto_bookings` напрямую), а связь — этим
вызовом после.

`okNodeKeys` — узлы, до которых мастер не дотронулся. Считает сайт
вычитанием из словаря узлов; приложение его не собирает, чтобы отчёт в PDF и
отчёт на экране не разошлись.

`POST /reports/item` возвращает весь отчёт с пересчитанной суммой, а не одну
строку: экран рисует сумму из ответа.

---

## Заметки о клиентах

Своей базы клиентов у приложения нет — карточка собирается из снимков записей
(`src/lib/clients.ts`). Заметка привязана к тому же `clientKey`:
учётка → телефон → имя.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /client-notes?shopId&actorUserId&keys=a,b,c` | `admin`, `owner` | `ClientNote[]` |
| `POST /client-notes/save` | `admin`, `owner` | пустой текст стирает заметку |

```ts
ClientNote = { clientKey, text, updatedAt, authorName }
```

`keys` — список через запятую, как их строит приложение. Ключи с чужого
сервиса игнорируются молча.

---

## Гараж клиента

Машины человека живут в его учётке на сайте — это тот же гараж, что он видит
в кабинете Абхаз Авто. Приложение их не хранит: карточка машины в сервисе
собирается из снимков записей (`src/lib/vehicles.ts`, «на чём приезжали»), а
гараж отвечает на другой вопрос — «чем человек ездит сейчас».

| Маршрут | Кому | Что |
|---|---|---|
| `GET /garage?shopId&actorUserId&clientUserId` | `admin`, `owner` | `StoGarageCar[]` — гараж клиента с учёткой |
| `GET /garage?shopId&actorUserId&phone` | `admin`, `owner` | то же, но учётку сайт ищет по номеру (ручная запись за стойкой) |

```ts
StoGarageCar = { id, brand, model, year, plate, vin, primary? }
```

`id` — это `vehicles.id` сайта, и он же ложится в `sto_bookings.vehicle_id`,
когда сервис записал клиента на машину из гаража: тогда запись видна клиенту
в кабинете рядом с этой машиной. Колонка в схеме уже есть.

Ровно один из `clientUserId` и `phone` обязателен; `phone` — в E.164, тем же
`normalizePhone`, что и везде. Учётки по номеру нет или гараж пуст — `data: []`
и статус 200: у клиента с улицы гаража не бывает, это не ошибка. Машины
чужого сервиса в ответе невозможны: гараж принадлежит клиенту, а не сервису,
поэтому сайт обязан проверить, что `actorUserId` — сотрудник `shopId`, и что
этот клиент в этом сервисе **записан хотя бы раз**; иначе по чужому номеру
можно было бы вычитать чей угодно гараж.

---

## Деньги

Экран хозяина. Выручку **за день** приложение считает само по записям дня
(`src/lib/stats.ts`), но неделя и месяц требуют прошлых периодов для
сравнения, разбивок и конверсии — это чтение за 30–60 дней на каждый заход.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /money?shopId&actorUserId&period` | `owner` | `MoneySummary` |

```ts
MoneySummary = { period, from, to, revenue, deltaPct, average, jobs, loadPct,
                 reportsSent, reportsBooked, bookedRevenue,
                 byMaster: { masterId, title, count, revenue }[],
                 byService: { title, count, revenue }[] }
```

Конверсия считается **по записям, пришедшим из отчётов** (`nextBookingId`), а
не по нажатым галочкам: галочка ничего не стоит, запись стоит.
`bookedRevenue` — деньги этих будущих работ, то есть то, что осмотр принёс
сверх текущей смены.

`period` — слово `day | week | month`, а не пара дат: «неделя» на сайте и в
приложении обязана начинаться с одного понедельника, и решать это должна одна
сторона. Ответ возвращает посчитанные границы в `from`/`to` — подпись строит
приложение.

Это **выручка по записям, а не касса**: факта оплаты в схеме нет, `done`
означает «работа сделана». Экран так её и называет.

---

## Чат

Переписка живёт в базе сайта — клиент пишет из своей записи, другого чата у
него нет. Приложение своего не заводит.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /chat/threads?shopId&actorUserId` | `master`, `admin` | `ChatThread[]` |
| `GET /chat/messages?shopId&actorUserId&threadId&limit` | те же | `ChatMessage[]` |
| `GET /chat/unread?shopId&actorUserId` | те же | `{ unread }` |
| `POST /chat/send` | те же | `ChatMessage` |

```ts
ChatThread  = { id, bookingId, clientName, clientPhone, lastText, lastAt, unread, threadUrl }
ChatMessage = { id, mine, text, at }
```

Отправку можно сделать последней: пока `POST /chat/send` отвечает
`not_found`, экран показывает переписку и уводит отвечать на сайт по
`threadUrl`. Это честнее своей формы, которая молча не доставит.

---

## Буфер между записями — не сюда

Дизайн добавляет в расписание «Буфер между записями: нет / 10 / 15 / 20 мин»:
запись на 60 минут занимает 75, и мастер успевает закрыть работу и принять
следующую машину.

Это **не новая сущность, а поле в `shops.sto_schedule`** (`bufferMin`), и
меняет оно `freeSlots` — функцию, копия которой лежит в обоих репозиториях и
обязана давать одинаковые окна на витрине и в календаре. Поэтому правка
идёт в `abkhaz-auto` (`src/lib/sto/schedule.ts`, `slots.ts`) и переносится
сюда тем же текстом, а не через этот API.

Пока виджет записи на сайте под выключенным флагом `sto_booking`, расхождение
пользователю не видно — но выкатывать их всё равно нужно вместе.

---

## Магазин товаров — `/api/sto/goods/*`

Зеркало контракта куска G (`abkhaz-auto`,
`docs/sto-api-goods-2026-10-18.md`; спека решений —
`docs/superpowers/specs/2026-10-18-goods-crm-design.md`). Первоисточник — там:
он сверен с кодом маршрутов. Здесь — ровно то, что приложение ждёт в `{ data }`
и шлёт в теле; клиентский слой — `src/lib/api/goods.ts`, имена полей в нём
совпадают с этим разделом буква в букву. Расходятся — правит тот, кто
меняет, в обоих репозиториях парой PR.

Экраны приложения: `/magazin` (Сегодня), `/zakazy` и `/zakazy/[id]` (Заказы,
Заказ), `/zakazy/novyi` (заказ по звонку), `/tovary` (Товары), `/pokupateli`
(Клиенты), общий «Ещё» `/menu`. Витрина — `rubric = 'goods'` и `status =
'approved'` в `shops`, вертикаль (`shops.goods_vertical`) из базы приложение
НЕ читает — только с сайта (`/goods/settings`, `/goods/today`).

Что в контракте есть, а приложение пока не рисует: `POST /items/photo` и
`POST /items/create` — функции клиентского слоя написаны, но «Добавить товар»
ведёт в редактор объявления на сайте (решение владельца по артборду:
«тот же редактор объявления Маркета»). Сканера штрих-кодов в приложении нет —
серийный номер при выдаче вводится руками.

### 0. Общее

Всё как у остальных `/api/sto/*` (`docs/API.md`, «Сущности приложения»):

- **Auth** — Ed25519 service-ticket в `x-service-ticket`; без тикета и на
  любом отказе подписи — `401 unauthorized`; ключ на сайте не задан — `500`.
- **Рубильник** — флаг `goods_crm` (отдельный от `sto_app`): выключен —
  `404 not_found` на все маршруты раздела. Вставлен выключенным; включать —
  Админка → Рубильники.
- **Кто** — `shopId` и `actorUserId` в каждом вызове (GET — в query, POST — в
  JSON-теле). Витрина обязана быть `rubric = 'goods'` и `status = 'approved'`
  (публикация витрины НЕ обязательна — заказы по звонку ведутся и без неё);
  иначе `403 forbidden`, как и постороннему. Витрина, найденная по телефону
  профиля, закрепляется за учёткой, как у СТО.
- **Роли** — `owner` (владелец по `shops.user_id` или телефону; админ сайта —
  владелец везде) и `admin` (строка `sto_members` этой витрины; приглашений под
  рубрику `goods` пока нет — см. спеку §11). `master` в раздел не пускается.
  Где в таблице написано «admin», владелец тоже проходит.
- **Ответ** — `{ "data": … }` при удаче, `{ "error": { "code", "message" } }` при
  отказе; коды `unauthorized` 401 · `forbidden` 403 · `not_found` 404 ·
  `validation_error` 400 · `conflict` 409 · `rate_limited` 429 · `internal` 500.
  `message` — по-русски, приложение показывает как есть.
- **Время** — ISO-8601 с смещением; сутки магазина — `+03:00` (Europe/Moscow
  без перевода часов), границы «сегодня» и «месяц» сайт считает сам.
- **Деньги** — рубли целыми числами (как `market_orders.total`), не копейки.
- **Таймауты приложения** — чтение 3 с, запись 8 с.
- Пустой список — `{ data: { …: [] } }`, не `404`.

Числа и адреса в примерах — из артборда.

### 1. Типы

```ts
type GoodsVertical = "flowers" | "electronics" | "general";

type GoodsOrderStatus = "new" | "assembling" | "ready" | "shipping" | "delivered" | "cancelled";
//  артборд:  новый     принят/собрать  готов    у курьера   закрыт        отказ

type GoodsOrderView = "new" | "work" | "ready" | "delivery" | "closed";
//  new → new · work → assembling · ready → ready · delivery → shipping ·
//  closed → delivered + cancelled за последние 60 дней

type GoodsOrderSource = "storefront" | "phone";   // с витрины (корзина Маркета) · заведён владельцем
type GoodsPayment = "online" | "on_receipt" | "transfer" | "link";
//  online — оплата на сайте (только у заказов с витрины);
//  on_receipt — при получении · transfer — перевод · link — ссылка (кусок F)

type GoodsOrderItemOut = {
  listingId: number;
  slug: string;                 // карточка на сайте /ad/<slug>
  title: string;
  price: number;                // ₽ за штуку, как записано в заказ
  qty: number;
  img: string | null;           // обложка (готовый URL) или null
  serial: string | null;        // электроника: серийный номер, записан при выдаче
  warrantyMonths: number | null;// электроника: гарантия, снимок на момент заказа
};

type GoodsOrderOut = {
  id: number;
  number: string;               // «1 042» — для людей
  source: GoodsOrderSource;
  status: GoodsOrderStatus;
  createdAt: string;
  updatedAt: string;            // последняя смена статуса
  method: "courier" | "pickup";
  city: string;                 // слаг региона (REGION_NAME)
  address: string | null;       // курьер: куда
  slot: string | null;          // окно доставки строкой («19.10 · 10:00–12:00» или слот Маркета)
  comment: string | null;       // комментарий покупателя с витрины
  payment: GoodsPayment;
  paidAt: string | null;        // когда отмечена оплата (у online — момент оформления)
  subtotal: number;             // товары, ₽
  delivery: number;             // доставка, ₽ (0 — бесплатно или самовывоз)
  total: number;                // subtotal + delivery
  items: GoodsOrderItemOut[];
  buyer: { name: string; phone: string | null; hasAccount: boolean };
  //  hasAccount — у заказа есть учётка покупателя: ему уходят уведомления сайта
  courier: { name: string; phone: string | null; own: boolean } | null;
  pickup: { address: string; hours: string } | null;
  ownDelivery: boolean;         // магазин возит сам → на «Курьеру» нужен courierId
  dueAt: string | null;         // момент передачи: начало окна доставки или время самовывоза
  reserveUntil: string | null;  // электроника: до какого момента держим
  reserveExpired: boolean;      // reserveUntil в прошлом, а заказ ещё активен
  goods: {
    vertical: GoodsVertical;
    recipient: { name: string; phone: string | null } | null;  // цветы: получатель
    deliveryDate: string | null;   // YYYY-MM-DD по часам магазина
    window: { from: string; to: string } | null;               // «10:00»–«12:00»
    card: string | null;           // открытка
    composition: string | null;    // состав
    readyBy: string | null;        // «собрать к» — ISO
    note: string | null;           // заметка владельца к заказу
    cancelReason?: string | null;  // причина отказа (при cancelled) — отдельно от заметки
  };
  clientOrdersCount: number;    // заказов с этого телефона в магазине, включая этот («заказывает 2-й раз»)
  next: GoodsOrderStatus[];     // какие переходы доступны магазину из текущего статуса
};

type GoodsOrderCounts = { new: number; work: number; ready: number; delivery: number; closed: number; today: number };

type GoodsStockMode = "count" | "today" | "on_order";
//  count — считаем штуки · today — «есть сегодня» (цветы, без счёта) · on_order — «под заказ»

type GoodsVisibility = "visible" | "hidden_stock" | "hidden_owner" | "hidden_moderation";
//  visible — активно на витрине · hidden_stock — снято остатком 0 (вернётся само при qty > 0)
//  hidden_owner — снято владельцем / сроком жизни товара (вернуть — в кабинете сайта)
//  hidden_moderation — снято модерацией (вернёт только поддержка)

type GoodsItemOut = {
  listingId: number;
  slug: string;
  title: string;
  description: string | null;   // первые 160 знаков описания — подстрока под названием
  price: number | null;         // ₽; null — цена не указана
  categorySlug: string;         // elektronika, kompyutery, raznoye, …
  categoryLabel: string;
  img: string | null;
  visibility: GoodsVisibility;
  stock: {                      // null — остаток не ведётся (строки goods_stock нет)
    mode: GoodsStockMode;
    qty: number;                // на складе (у today/on_order — не используется, 0)
    reserved: number;           // в активных заказах (считается по заказам, не хранится)
    available: number;          // qty − reserved, не меньше 0
    lowThreshold: number;
    low: boolean;               // mode = count и available ≤ lowThreshold
  } | null;
  updatedAt: string;
};

type GoodsItemCounts = { all: number; low: number; hidden: number };
type GoodsCategoryCount = { slug: string; label: string; count: number };

type GoodsClientDate = {
  label: string;                // «день рождения мамы», «8 марта»
  day: string;                  // «MM-DD»; год не хранится — дата повторяется ежегодно
  kind: "holiday" | "upgrade_offered";
};

type GoodsClientSegment = "regular" | "holiday_soon" | "dormant" | "warranty_ending";
//  regular — 3+ закрытых заказа · holiday_soon — дата в ближайшие 14 дней ·
//  dormant — последний заказ больше 90 дней назад · warranty_ending — гарантия по
//  выданному заказу кончается в ближайшие 30 дней (электроника)

type GoodsClientOut = {
  phone: string;                // E.164 — ключ клиента
  name: string;                 // из заметки, иначе из последнего заказа
  ordersCount: number;          // без отменённых
  closedCount: number;          // delivered
  totalClosed: number;          // ₽ по закрытым
  firstAt: string;
  lastAt: string;               // последний заказ (любой статус, кроме отменённых)
  lastStatus: GoodsOrderStatus;
  hasAccount: boolean;          // хоть один заказ с учёткой сайта
  note: string;                 // '' — нет
  dates: GoodsClientDate[];
  segments: GoodsClientSegment[];
  nextDate: { label: string; day: string; inDays: number } | null;  // ближайшая дата из dates
  warrantyEndsAt: string | null;// ближайшее окончание гарантии по выданным заказам
};

type GoodsClientView = "all" | "regular" | "holidays" | "dormant" | "warranty";
type GoodsClientCounts = { all: number; regular: number; holidays: number; dormant: number; warranty: number };

type GoodsTodayOut = {
  shop: {
    id: number; name: string; slug: string | null; vertical: GoodsVertical;
    regionSlug: string | null;
    storefront: "off" | "requested" | "published" | "hidden";
    storefrontUrl: string | null; // https://abkhaz-auto.ru/m/<slug> у опубликованной
  };
  subscription: { until: string | null; daysLeft: number | null; expired: boolean };
  //  until — YYYY-MM-DD (shops.access_until); null — срок не задан (считается как бессрочно)
  orders: { new: number; overdueNew: number; today: number; todayCourier: number; todayPickup: number };
  //  overdueNew — новых без ответа дольше slaNewHours; today — активных с dueAt
  //  или reserveUntil в сегодняшних сутках магазина
  slaNewHours: number;          // market_settings.sla_new_hours — «ответить до …»
  storefront7d: { views: number; phoneReveals: number };
  month: { from: string; revenue: number; closed: number };
  //  с 1-го числа по часам магазина; revenue — сумма total закрытых (delivered) заказов
  upcoming: GoodsOrderOut[];    // до 5 активных заказов по dueAt (без dueAt — в конце, по времени создания);
                                // clientOrdersCount у них не считается (всегда 1) — подпись «2-й раз» берите из карточки
  ads: {
    campaignId: number; title: string; status: string;
    balance: number;            // кошелёк владельца, ₽
    spent7d: number;            // расход за 7 дней, ₽
    daysLeft: number | null;    // balance ÷ средний дневной расход; null — расхода нет и лимита нет
  } | null;                     // null — активных кампаний у владельца нет
};
```

### 2. Сводка и настройки

| Маршрут | Роли | Вход | Ответ |
|---|---|---|---|
| `GET /api/sto/goods/today` | admin, owner | — | `GoodsTodayOut` |
| `GET /api/sto/goods/settings` | admin, owner | — | `{ vertical }` |
| `POST /api/sto/goods/settings` | owner | `vertical` — `flowers` · `electronics` · `general` | `{ vertical }` |

Вертикаль задаёт набор полей, которые приложение показывает в заказе; сайт
поля по вертикали не отсекает — только проверяет их форму.

### 3. Заказы

| Маршрут | Роли | Вход | Ответ |
|---|---|---|---|
| `GET /api/sto/goods/orders` | admin, owner | `view` — `GoodsOrderView` (по умолчанию `new`) | `{ orders: GoodsOrderOut[], counts: GoodsOrderCounts }` — не больше 200 на вид; активные — по `dueAt` (без него — новые сверху), закрытые — новые сверху |
| `GET /api/sto/goods/orders/item` | admin, owner | `orderId` | `GoodsOrderOut`; заказ другого магазина — `404` |
| `POST /api/sto/goods/orders/create` | admin, owner | тело §3.1 | `GoodsOrderOut` |
| `POST /api/sto/goods/orders/transition` | admin, owner | тело §3.2 | `{ order: GoodsOrderOut, clientMessage: string \| null }` |
| `POST /api/sto/goods/orders/reserve` | admin, owner | `orderId`, `days?` (1…14, по умолчанию 2) | `GoodsOrderOut` — `reserveUntil` = max(сейчас, прежний) + days; у закрытого заказа — `409` |
| `POST /api/sto/goods/orders/note` | admin, owner | `orderId`, `note` (до 500; пустая — убрать) | `GoodsOrderOut` |

#### 3.1. Заказ по звонку — `POST /orders/create`

```ts
{
  shopId, actorUserId,
  items: { listingId: number; qty: number; price?: number }[];   // 1…20 позиций, qty 1…999
  //  listingId — активное объявление ЭТОГО магазина; price — ₽ за штуку, как назвал
  //  владелец (не передан — цена объявления без скидок витрины)
  buyer: { name: string; phone: string };                         // имя 1…60; телефон нормализуется в E.164
  method: "courier" | "pickup";
  address?: string;             // обязателен при courier (до 200)
  city?: string;                // слаг региона; по умолчанию регион магазина
  deliveryPrice?: number;       // ₽, 0…100 000, по умолчанию 0
  deliveryDate?: string;        // YYYY-MM-DD по часам магазина
  window?: { from: string; to: string };   // «HH:MM», from < to; только вместе с deliveryDate
  pickupAt?: string;            // самовывоз ко времени — ISO
  payment?: "on_receipt" | "transfer" | "link";   // по умолчанию on_receipt
  recipient?: { name: string; phone?: string };    // цветы: получатель, если не покупатель
  card?: string;                // открытка, до 300
  composition?: string;         // состав, до 500
  note?: string;                // заметка владельца, до 500
  reserveDays?: number;         // 1…14; по умолчанию 2 у electronics + pickup, иначе резерва нет
  accept?: boolean;             // true — сразу в assembling («принят»); иначе new
}
```

Правила: сайт читает объявления по `listingId`, проверяет `shop_id` и
`status = 'active'` (иначе `404` с названием позиции); у позиции со строкой
остатка `mode = count` требует `available ≥ qty` (иначе `409` «осталось N»);
`dueAt` = начало окна (`deliveryDate` + `window.from`), иначе `deliveryDate`
00:00, иначе `pickupAt`; `reserveUntil` = сейчас + `reserveDays`; `slot` =
«19.10 · 10:00–12:00»; `buyer.hasAccount = false`, уведомления сайта такому
клиенту не уходят. Позиции «свободной строкой» без объявления не принимаются
(спека §11.5).

#### 3.2. Переход — `POST /orders/transition`

```ts
{
  shopId, actorUserId, orderId,
  status: GoodsOrderStatus;     // куда
  readyBy?: string;             // при assembling: «собрать к» — ISO (пишется в goods.readyBy, и в dueAt, если он пуст)
  courierId?: string;           // при shipping у магазина со своей доставкой — id из shops.couriers (иначе 400)
  serials?: { listingId: number; serial: string }[];   // при delivered: серийники по позициям (до 40 знаков)
  paid?: boolean;               // при delivered (или любом шаге): отметить оплату — paidAt = сейчас
  cancelReason?: string;        // при cancelled, до 300 — уходит в goods.cancelReason (заметка goods.note остаётся)
}
```

Переходы магазина (общие с кабинетом сайта):

| из | куда |
|---|---|
| `new` | `assembling`, `cancelled` |
| `assembling` | `ready`, `shipping` (только курьер), `cancelled` |
| `ready` | `shipping` (только курьер), `delivered`, `cancelled` |
| `shipping` | `delivered`, `cancelled` |

Тот же статус повторно — `200` без изменений (идемпотентно). Иное — `409
conflict` «Так поменять статус нельзя». Переход в `delivered` списывает остаток
у позиций с `mode = count` сам (триггер) и заводит сделки для отзыва, если у
покупателя есть учётка.

Уведомления: покупателю с учёткой — строка колокольчика и пуш на каждый шаг
(как из кабинета сайта). `clientMessage` — готовый текст для WhatsApp клиенту
(и с учёткой, и без): на `assembling`, `ready`, `shipping`, `delivered`; на
остальные — `null`. Приложение открывает `https://wa.me/<цифры>?text=…` само.

#### 3.3. Пример карточки (электроника, с витрины)

```json
{ "data": {
  "id": 318, "number": "318", "source": "storefront", "status": "new",
  "createdAt": "2026-10-18T09:05:00.000Z", "updatedAt": "2026-10-18T09:05:00.000Z",
  "method": "pickup", "city": "gagra", "address": null, "slot": null, "comment": null,
  "payment": "online", "paidAt": "2026-10-18T09:05:00.000Z",
  "subtotal": 54990, "delivery": 0, "total": 54990,
  "items": [{ "listingId": 7701, "slug": "lenovo-ideapad-3-15-abc12", "title": "Ноутбук Lenovo IdeaPad 3 15\"", "price": 54990, "qty": 1, "img": "https://…/cover.webp", "serial": null, "warrantyMonths": 12 }],
  "buyer": { "name": "Астамур Квициния", "phone": "+79404445566", "hasAccount": true },
  "courier": null, "pickup": { "address": "Гагра, пр. Ардзинба 10", "hours": "10:00–20:00" }, "ownDelivery": false,
  "dueAt": null, "reserveUntil": "2026-10-20T17:00:00.000Z", "reserveExpired": false,
  "goods": { "vertical": "electronics", "recipient": null, "deliveryDate": null, "window": null, "card": null, "composition": null, "readyBy": null, "note": null },
  "clientOrdersCount": 1,
  "next": ["assembling", "cancelled"]
} }
```

### 4. Товары

| Маршрут | Роли | Вход | Ответ |
|---|---|---|---|
| `GET /api/sto/goods/items` | admin, owner | `view?` — `all` · `low` · `hidden` (по умолчанию `all`); `category?` — слаг раздела | `{ items: GoodsItemOut[], counts: GoodsItemCounts, categories: GoodsCategoryCount[] }` — объявления магазина со статусом `active` и `archived` (удалённые и проданные не показываются), до 500, по названию; `counts` и `categories` (по алфавиту подписи) — по всем, не по виду |
| `POST /api/sto/goods/items/stock` | admin, owner | `listingId`, `mode?`, `qty?` (0…99 999), `lowThreshold?` (0…999) — хотя бы одно | `GoodsItemOut` — строка остатка заводится (без `mode` — `count`) или правится; чужое объявление — `404`; возврат на витрину упёрся в близнеца — `409` |
| `POST /api/sto/goods/items/price` | admin, owner | `listingId`, `price` (1…100 000 000) | `GoodsItemOut` |
| `POST /api/sto/goods/items/photo` | owner | multipart: `shopId`, `actorUserId`, `file` (jpeg/png/webp/heic, до 8 МБ) | `{ stagedId: number; url: string }` — кадр в прихожей владельца витрины (24 часа), водяной знак наложен; больше 20 в минуту — `429` |
| `POST /api/sto/goods/items/create` | owner | тело §4.1 | `GoodsItemOut` |

Видимость: `qty = 0` при `mode = count` снимает объявление с витрины само
(`hidden_stock`), `qty > 0` — возвращает; снятое владельцем или модерацией
остатком не возвращается (`hidden_owner` / `hidden_moderation` остаются).
Чип «Кончаются» = `view=low`; «скрыто» = `view=hidden` (все три причины).

#### 4.1. Новый товар — `POST /items/create`

```ts
{
  shopId, actorUserId,
  title: string;                // 5…200
  price: number;                // ₽, 1…100 000 000
  categorySlug: string;         // раздел группы goods (elektronika, kompyutery, raznoye, …), разрешённый магазинам
  description?: string;         // до 4000
  attrs?: Record<string, unknown>;   // поля раздела (как у формы подачи); warranty_months — гарантия по умолчанию для заказов
  stock?: { mode: GoodsStockMode; qty?: number; lowThreshold?: number };   // нет — остаток не ведётся
  stagedIds?: number[];         // кадры из /items/photo, до 14, в порядке показа
}
```

Объявление заводится от учётки владельца витрины (`listings.user_id =
shops.user_id`, `shop_id` = магазин, `attrs.market_kind = 'delivery'`, регион
магазина), проходит ту же проверку текста, что форма подачи (`400` с
сообщением); у витрины без учётки владельца (`shops.user_id` пуст и телефон не
совпал) — `409` «сначала войдите на сайт этим номером». Витрина не опубликована
— товар создаётся, но на сайте не виден до публикации (`visibility` при этом
считается по объявлению, не по витрине).

### 5. Клиенты

| Маршрут | Роли | Вход | Ответ |
|---|---|---|---|
| `GET /api/sto/goods/clients` | admin, owner | `view?` — `GoodsClientView` (по умолчанию `all`) | `{ clients: GoodsClientOut[], counts: GoodsClientCounts }` — по последнему заказу, до 1000 |
| `POST /api/sto/goods/clients/note` | admin, owner | `phone` (E.164 после нормализации), `name?` (до 80), `note?` (до 1000), `dates?` (`GoodsClientDate[]`, до 20; `day` — `MM-DD`) | `GoodsClientOut`; телефона нет среди заказов магазина — `404` |

Переданные поля перезаписываются, не переданные остаются; все три пустые —
строка заметки удаляется, клиент в списке остаётся (он из заказов).

### 6. Коды ошибок по маршрутам

| Код | Когда |
|---|---|
| `validation_error` 400 | поля не по форме; `courierId` не передан при своей доставке; `window` без `deliveryDate` |
| `forbidden` 403 | витрина не `goods`/не одобрена/чужая; роль не пускает |
| `not_found` 404 | заказ или объявление другого магазина; телефон без заказов; флаг выключен |
| `conflict` 409 | недопустимый переход; остатка не хватает; резерв у закрытого заказа; близнец при возврате на витрину; витрина без учётки владельца при создании товара |
| `rate_limited` 429 | фото чаще 20 в минуту или больше 40 кадров в прихожей |
| `internal` 500 | база или хранилище не ответили — повторить |

### 7. Что приложению нужно знать помимо маршрутов

- **Вход** — тот же, что у автосервиса: витрину владельца приложение находит по
  владению (`lib/shop.ts`), но для рубрики `goods`; раздел СРМ товаров рисуется,
  когда у витрины `rubric = 'goods'`. Один человек может владеть и сервисом, и
  магазином — выбор витрины остаётся на приложении.
- **Карточка товара на сайте** — `https://abkhaz-auto.ru/ad/<slug>`; витрина —
  `storefrontUrl` из `/today`.
- **WhatsApp** — `clientMessage` из перехода и `phone` клиента; сайт сообщений
  клиентам без учётки не шлёт.
- **Подписка** — продление и счета делает B2B-менеджер (кусок F даст ссылку
  оплаты; в `/today` пока только срок).
- **Пуши владельцу** о новом заказе с витрины — штатные уведомления Маркета
  (`market_order`, href в кабинет сайта); пуш в приложение «Бизнес» идёт тем же
  FCM-токеном учётки.

### 8. Чего здесь нет (и почему)

- Сотрудников магазина товаров (`/members/*` под рубрику `goods`) — отдельная
  задача после куска H.
- Редактирования заказа после создания (состав, адрес) — отказ и новый заказ;
  владелец на артборде этого не просил.
- Автоотмены по истёкшему резерву — только признак `reserveExpired`.
- Рассылок клиентам — только список и текст для WhatsApp.
