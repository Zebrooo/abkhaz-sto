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
| `GET /members/me?shopId&actorUserId` | любому своему | `{ role, masterId, active }` |
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

**Пока маршрута `/members/me` нет**, приложение считает вошедшего `owner` —
это ровно сегодняшнее поведение, и прав оно не расширяет: до этого места
доходит только владелец подтверждённой витрины.

---

## Мастера

Мастер и сотрудник — разные вещи. Мастер может не иметь учётки (`userId: null`):
он есть в расписании и отчётах, но в приложение не входит.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /masters?shopId&actorUserId` | `admin`, `owner` | `StoMaster[]` |
| `GET /masters/load?shopId&actorUserId&from&to` | `admin`, `owner` | `MasterLoad[]` |
| `POST /masters` | `owner` | создать |
| `POST /masters/update` | `owner`; смену (`onShift`) — и `admin` | патч → `{ master, orphaned }` |
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
Мастер такой гарантии не даёт — он уходит на другой пост, болеет, меняется в
обед.

Отсюда поведение при `onShift: false` или `active: false`: **записи мастера
остаются на своих постах** и ждут нового исполнителя. Убрать вместе с ним
занятые окна значило бы молча потерять пришедших клиентов. Ответ несёт
`orphaned` — номера записей, оставшихся без мастера; экран показывает их
сразу после переключателя.

Автор отчёта — мастер **записи**, а не тот, кто сегодня стоит на посту: за
день на посту могут смениться двое.

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
| `POST /inspections/start` | `master`, `admin` | идемпотентно: повтор отдаёт начатый |
| `POST /inspections/defects` | `master`, `admin` | `Defect` |
| `POST /inspections/defects/update` | `master`, `admin` | `Defect` |
| `POST /inspections/defects/remove` | `master`, `admin` | `{ removed: true }` |
| `GET /inspections/presets?shopId&actorUserId&nodeKey?` | `master`, `admin` | `DefectPreset[]` |
| `GET /inspections/presets/frequent?shopId&actorUserId&limit` | те же | `DefectPreset[]` |
| `POST /inspections/photo-upload` | `master`, `admin` | `{ photoId, uploadUrl, expiresAt }` |

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

**Смету считает сайт.** Приложение не складывает цены: сумма уходит клиенту и
в деньги сервиса, а две реализации одного сложения рано или поздно разойдутся.

| Маршрут | Кому | Что |
|---|---|---|
| `GET /reports?shopId&actorUserId&inspectionId` | `master`, `admin`, `owner` | `Report` |
| `GET /reports/list?shopId&actorUserId&from&to&masterId?` | те же | `ReportBrief[]` |
| `POST /reports/item` | `master`, `admin` | `{ …, defectId, included }` → **весь** `Report` |
| `POST /reports/book-item` | `admin`, `owner` | `{ …, defectId, bookingId }` → `Report` |
| `POST /reports/send` | `master` → админу, `admin` → клиенту | `Report` |
| `GET /reports/pdf?shopId&actorUserId&inspectionId` | те же | `{ url, expiresAt }` |

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
