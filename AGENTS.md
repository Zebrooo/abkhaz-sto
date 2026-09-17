# abkhaz-business — «АбхазАвто Бизнес», приложение для автосервисов

Отдельный фронт над общей базой Абхаз Авто: записи, календарь, расписание,
прайс сервиса. Эпик — `djonua/abkhaz-auto#1265`; правила ниже — те же, что в
`abkhaz-auto/AGENTS.md`, здесь только то, что отличается или важно помнить.

## Границы — что здесь есть и чего нет

- **Схемы БД здесь нет и не будет.** Все миграции — в `abkhaz-auto`
  (`supabase/migrations`). Нужна колонка или RPC — задача и PR туда, потом
  код здесь. Файлы `src/lib/sto/schedule.ts`, `types.ts`, `slots.ts`,
  `transitions.ts` — копии модулей сайта: правки вносить в оба репозитория
  одним и тем же текстом, пока не появится общий пакет.
- **Сущностей, которых нет в схеме записи, приложение не заводит — оно их
  спрашивает.** Мастера, роли и доступы, осмотр, отчёты по диагностике,
  заметки о клиентах, деньги и чат живут на стороне сайта и приезжают сюда
  подписанным запросом: клиентский слой — `src/lib/api/*`, контракт —
  `docs/API-sushchnosti.md`. Своя таблица в общей базе была бы второй
  миграционной веткой на один Postgres, а такие расходятся молча. Отсюда
  порядок работы: сначала сущность в контракте, потом модуль в
  `src/lib/api/`, и только потом экран.
- **Роль — подсказка интерфейсу, а не граница доступа** (`src/lib/access.ts`).
  Отказывает сайт: он знает роль по `actorUserId` в каждом запросе. Здесь мы
  решаем, что рисовать, а не что разрешать.
- **Вход — на сайте.** Кука сессии общая для поддоменов (`aa-auth-token`,
  `.abkhaz-auto.ru`, см. `src/lib/auth-cookies.ts`); своих экранов ввода кода
  нет. Имя и домен куки обязаны совпадать с сайтом.
- **Чтение базы — под сервисным ключом на сервере после проверки
  владения** (`src/lib/shop.ts`: витрина рубрики `service` по `user_id` или
  телефону учётки; номер из `profiles` лежит без плюса, к E.164 его приводит
  `ownerFilter` в `src/lib/shop-owner.ts`, пустой или кривой телефон не
  считается). В браузер сервисный ключ не уходит; клиентских запросов к
  Supabase нет.
- **Побочные эффекты — на сайте.** Пуш, Telegram, проводки предоплаты делает
  сервер `abkhaz-auto` по подписанному событию (`src/lib/site-events.ts`,
  `@zebrooo/service-ticket`, маршрут `/api/sto/booking-event` — задача
  #1272). Пока его нет — событие пишется в лог и пропускается, переход в
  базе уже сделан.
- Время везде по часам сервиса — Europe/Moscow без перевода часов
  (`STO_TZ_OFFSET` в `slots.ts`); в базе — timestamptz.

## Ветки и PR — строго

Как в abkhaz-auto: ни одного коммита в `main` напрямую, задача = ветка
`feat|fix|chore/<кебаб>` от свежего `origin/main` + PR; свой PR мержишь сам
после зелёного `checks` и разбора ревью. Единственное исключение — начальный
коммит пустого репозитория.

## CI и деплой

- `.github/workflows/ci.yml` — одна джоба `checks` (линт, типы, тесты,
  сборка) на self-hosted раннере `ci`. **Сторонних GitHub Actions нет и не
  будет**: с раннеров недоступна сеть Microsoft, checkout сделан шагом `run`.
- Приватный пакет `@zebrooo/service-ticket` ставится по `NODE_AUTH_TOKEN`
  (секрет репозитория). Локально без токена: `types/service-ticket.d.ts`
  даёт типы, для сборки — временная заглушка в `node_modules` (README).
- Деплой — `.github/workflows/deploy.yml` руками владельца, один workflow на
  два контура (вход `environment`): `test` — контейнер `abkhaz-business-test` на
  185 (`business.abkhaz-auto.apsoftgroup.ru`), `prod` — `abkhaz-business-prod` на
  170 (`business.abkhaz-auto.ru`). Портов наружу нет, только сеть Traefik.
  Blue-green нет намеренно: одно приложение, один контейнер на контур
  (см. `deploy/<контур>/docker-compose.yml`).

## Код — скучно, а не умно

Правила abkhaz-auto: никаких хуков с пустыми функциями, обёрток ради одного
значения, флагов «смонтировано». Экраны — серверные компоненты и формы с
серверными действиями; клиентский код только там, где без него нельзя
(подсветка текущего пункта навигации).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
