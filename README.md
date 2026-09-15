# АбхазАвто Бизнес

Приложение для автосервисов площадки [Абхаз Авто](https://abkhaz-auto.ru):
записи клиентов, календарь по постам, расписание и предоплата, прайс.
Отдельный Next.js-фронт над общей базой сайта (`djonua/abkhaz-auto`);
схема данных, вход, деньги и уведомления живут там (эпик
`djonua/abkhaz-auto#1265`, границы — в `AGENTS.md`).

## Экраны

| Путь | Что |
|---|---|
| `/` | смена: сводка дня, кто ждёт подтверждения, что сейчас на постах, что дальше |
| `/segodnya` | записи дня таймлайном по постам: линия «сейчас», свободные окна, фильтры статусов |
| `/kalendar` | неделя столбиками загрузки и записи выбранного дня; перенос записи на свободное окно |
| `/kalendar/novaya` | ручная запись в три шага: услуга → день, пост и окно → клиент |
| `/zapis/[id]` | карточка записи: статус и его история, клиент, машина, предоплата, действия |
| `/klienty`, `/klienty/[ключ]` | клиенты сервиса — свод по его записям: машины, история, суммы |
| `/uslugi` | услуги витрины: цена и длительность (от неё считаются окна), показ на витрине |
| `/raspisanie` | часы по дням недели, перерывы, посты, шаг сетки, выходные, предоплата |
| `/uvedomleniya` | новые записи с сайта, отмены клиентом, зачисленная предоплата |
| `/menu` | «Ещё»: вход в услуги, расписание, уведомления и витрину на сайте |
| `/zapis/[id]/osmotr`, `/zapis/[id]/otchet` | осмотр с фото дефектов (норму не отмечают) и отчёт по диагностике со сметой |
| `/moi-raboty` | мастер: текущая работа с таймером, следующие записи его поста, отчёты за смену |
| `/svodka` | хозяин: выручка за день/неделю/месяц, средний чек, загрузка, конверсия отчётов в работы, по мастерам и услугам |
| `/mastera` | мастера, посты, смена; записи, оставшиеся без мастера |
| `/dostupy` | хозяин: сотрудники и роли, приглашение по номеру |
| `/chat`, `/chat/[id]` | диалоги с клиентами с сайта и переписка по записи |
| `/vhod` | объяснение входа: вход на сайте, кука общая для поддоменов |

Роли — мастер, админ, хозяин (`src/lib/access.ts`): у каждой свои вкладки,
меню и первый экран. Роль читается с витрины: своя — хозяин, чужая — из
списка сотрудников с сайта.

До 880px — телефон (приложение в оболочке), от 881px — рабочее место за
стойкой: слева разделы, в центре таймлайн, справа сводка смены. Один и тот же
серверный код, разница только в CSS.

## Внешний вид

Дизайн-система — общая с сайтом: токены (`src/app/globals.css`) скопированы из
`abkhaz-auto/src/styles/tokens.css`, примитивы (`aui-btn`, `rspec`,
`aui-badge`) — из `packages/ui/styles/components.css`, иконки
(`src/components/Icon.tsx`) — те же линейные глифы, что в `packages/ui`.
Новых цветов, радиусов и теней не заводим: расходиться с площадкой нельзя.

Шрифты — свои файлы (`@fontsource-variable/manrope`,
`@fontsource/jetbrains-mono`), а не Google Fonts: у сервиса за стойкой
интернет бывает узкий, а сборка не должна ходить в сеть за шрифтом.

## Сущности с сайта

Мастера, роли и доступы, осмотр и отчёты по диагностике, заметки о клиентах,
деньги и чат в схеме записи на СТО не существуют, и своих таблиц приложение
не заводит: оно спрашивает их у сайта подписанным запросом
(`@zebrooo/service-ticket`, как promo-bff). Клиентский слой — `src/lib/api/*`,
по модулю на сущность; что именно и в каком виде приложение ждёт, описано в
`docs/API-sushchnosti.md`.

Маршрутов на стороне сайта пока нет. До их появления эти разделы показывают
пустое состояние, а роль вошедшего считается `owner` — ровно как было до
разграничения: приложение открывает владелец подтверждённой витрины, и прав
это не расширяет.

## Запуск локально

```bash
pnpm install            # нужен NODE_AUTH_TOKEN для @zebrooo/service-ticket (GitHub Packages)
cp .env.example .env.local   # URL и ключи Supabase — те же, что у сайта
pnpm dev                # http://localhost:3000
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Без токена GitHub Packages: убрать `@zebrooo/service-ticket` из
`package.json` на время `pnpm install` (и вернуть), типы даёт
`types/service-ticket.d.ts`; для `pnpm build` положить заглушку в
`node_modules/@zebrooo/service-ticket` (`index.js` с `SERVICE_TICKET_HEADER`
и `issueServiceTicket`). Коммитить ни то, ни другое нельзя.

### Вход в разработке

Сессия читается из куки сайта `aa-auth-token` на домене `.abkhaz-auto.ru`.
На `localhost` эту куку не получить, поэтому для локальной разработки:
поднять сайт и приложение под одним доменом через `/etc/hosts`
(`dev.abkhaz-auto.ru` → 127.0.0.1) и `NEXT_PUBLIC_COOKIE_DOMAIN=.abkhaz-auto.ru`
в обоих, либо работать на тест-стенде. Своего экрана входа приложение не
имеет намеренно.

## Переменные окружения

См. `.env.example`. `NEXT_PUBLIC_*` запекаются в бандл при сборке — прокинуты
через `Dockerfile`, `deploy/<контур>/docker-compose.yml` и `deploy.yml`; домен куки без
значения валит сборку нарочно.

## Деплой

Actions → Deploy → Run workflow, выбрать контур (`test` или `prod`). Один и тот
же workflow катит оба: образ собирается на раннере с меткой `ci`, пушится в
ghcr, затем раннер с меткой `deploy-test` (185) или `deploy-prod` (170) его
подтягивает и перезапускает контейнер. Очередь — своя на контур, выкаты в
разные контуры друг друга не ждут.

Публичные build-аргументы лежат в `deploy/<контур>/build.env` в репозитории и
в `vars` не дублируются: они и так уезжают в браузер, а в git видны вместе с
кодом. Секреты — в Environment-секретах контуров `test` и `prod`:
`NODE_AUTH_TOKEN` (GitHub Packages), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`,
при необходимости `GHCR_TOKEN`.

Здоровье после выката снимается с самого контейнера
(`docker inspect … .State.Health.Status`), а не запросом с хоста: наружу портов
нет, приложение доступно только через сеть Traefik.

## Тест-стенд (185)

Хост `business.abkhaz-auto.apsoftgroup.ru` за Traefik тест-сайта; куки общие с
`abkhaz-auto.apsoftgroup.ru` (домен `.abkhaz-auto.apsoftgroup.ru`, см.
`deploy/test/build.env` сайта). Штатный путь — Actions → Deploy с контуром
`test`. Запасной путь, если конвейер недоступен, — собрать образ прямо на
сервере из архива исходников:

```bash
git archive --format=tar HEAD | ssh -p 22222 abkhaz-dev@185.228.132.60 \
  'mkdir -p ~/abkhaz-business/src && tar -x -C ~/abkhaz-business/src'
ssh -p 22222 abkhaz-dev@185.228.132.60 'cd ~/abkhaz-business/src && set -a && . deploy/test/build.env && set +a \
  && docker build --secret id=npmrc,src=$HOME/abkhaz-business/npmrc \
     --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
     --build-arg NEXT_PUBLIC_SITE_URL --build-arg NEXT_PUBLIC_COOKIE_DOMAIN \
     --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t abkhaz-business:test . \
  && docker compose -f deploy/test/docker-compose.yml up -d'
```

`~/abkhaz-business/npmrc` (права 600) — одна строка
`//npm.pkg.github.com/:_authToken=<токен GitHub Packages>`, монтируется
секретом сборки и в образ не попадает; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
— из окружения сессии, тот же, что в `~/abkhaz-business/.env.production`. Секреты приложения —
`~/abkhaz-business/.env.production`: сервисный ключ тест-Supabase,
`SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`, `STO_TICKET_*`.

## Прод (170) — business.abkhaz-auto.ru

Хост `business.abkhaz-auto.ru` за боевым Traefik; DNS-запись на `170.168.8.16` уже
есть. Кука сессии выдаётся сайтом на `.abkhaz-auto.ru` (`abkhaz-auto`,
`deploy/prod/build.env`), поэтому на поддомене вход работает сам: отдельного
экрана ввода кода здесь нет и не будет.

**Порядок первого выката.**

1. **Миграции.** Таблица `sto_bookings` и колонки `shops.sto_*` живут в
   `abkhaz-auto` (`supabase/migrations/20260915*`). Приложение без них не
   читает записи. Миграции применяет выкат сайта (Actions → Deploy → prod,
   blue-green применяет их до переключения трафика) — катит владелец.
   Руками в боевую базу не применять: это то же нарушение, что прямой пуш.
2. **Секреты.** `/data/abkhaz-business/.env.production` (права 600): сервисный ключ
   боевого Supabase, `SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`,
   `STO_TICKET_SRC`/`STO_TICKET_DST`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
3. **Сеть Supabase.** Сверить имя (`docker network ls | grep supabase`) и при
   расхождении поправить `name:` в `deploy/prod/docker-compose.yml`.
4. **Сборка и запуск** (раннеров у репозитория нет — собираем на сервере):

```bash
git archive --format=tar HEAD | ssh <прод> 'mkdir -p /data/abkhaz-business/src && tar -x -C /data/abkhaz-business/src'
ssh <прод> 'cd /data/abkhaz-business/src && set -a && . deploy/prod/build.env && set +a \
  && export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(grep -m1 "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" /data/abkhaz-business/.env.production | cut -d= -f2-) \
  && docker build --secret id=npmrc,src=/data/abkhaz-business/npmrc \
     --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
     --build-arg NEXT_PUBLIC_SITE_URL --build-arg NEXT_PUBLIC_COOKIE_DOMAIN \
     --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t abkhaz-business:prod . \
  && docker compose -f deploy/prod/docker-compose.yml up -d \
  && shred -u /data/abkhaz-business/npmrc'
```

`/data/abkhaz-business/npmrc` — одна строка
`//npm.pkg.github.com/:_authToken=<токен GitHub Packages>`, права 600,
монтируется секретом сборки, в образ не попадает, удаляется сразу после.

**Что увидят люди.** Приложение открыто только владельцу одобренной витрины
рубрики `service`: без сессии — экран «Войдите на сайте», с чужой сессией —
он же. Виджет записи на самом сайте остаётся под флагом `sto_booking`, то есть
клиенты записываться не начнут, пока флаг не включат; ручная запись из
приложения работает сразу после миграций.
