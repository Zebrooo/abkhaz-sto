# Абхаз Авто · Сервис

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
| `/vhod` | объяснение входа: вход на сайте, кука общая для поддоменов |

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

Чего в приложении нет: экранов мастеров и чата с клиентом — под них нет ни
таблиц, ни API, а схема живёт в `abkhaz-auto` (см. `AGENTS.md`).

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
через `Dockerfile`, `docker-compose.yml` и `deploy.yml`; домен куки без
значения валит сборку нарочно.

## Деплой

Actions → Deploy (владелец). Секреты и переменные репозитория:
`NODE_AUTH_TOKEN`, `GHCR_TOKEN` (при необходимости),
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; `vars`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_COOKIE_DOMAIN`. На сервере 170: `/data/abkhaz-sto` с
`docker-compose.yml` и `/etc/abkhaz-sto/.env.production` (сервисный ключ,
`SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`, `STO_TICKET_*`), раннер с
меткой `deploy-prod`, запись `sto.abkhaz-auto.ru` в DNS.

## Тест-стенд (185)

Хост `sto.abkhaz-auto.apsoftgroup.ru` за Traefik тест-сайта; куки общие с
`abkhaz-auto.apsoftgroup.ru` (домен `.abkhaz-auto.apsoftgroup.ru`, см.
`deploy/test/build.env` сайта). Раннеров у репозитория пока нет, поэтому образ собирается на самом
сервере из архива исходников:

```bash
git archive --format=tar HEAD | ssh -p 22222 abkhaz-dev@185.228.132.60 \
  'mkdir -p ~/abkhaz-sto/src && tar -x -C ~/abkhaz-sto/src'
ssh -p 22222 abkhaz-dev@185.228.132.60 'cd ~/abkhaz-sto/src && set -a && . deploy/test/build.env && set +a \
  && docker build --secret id=npmrc,src=$HOME/abkhaz-sto/npmrc \
     --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
     --build-arg NEXT_PUBLIC_SITE_URL --build-arg NEXT_PUBLIC_COOKIE_DOMAIN \
     --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t abkhaz-sto:test . \
  && docker compose -f deploy/test/docker-compose.yml up -d'
```

`~/abkhaz-sto/npmrc` (права 600) — одна строка
`//npm.pkg.github.com/:_authToken=<токен GitHub Packages>`, монтируется
секретом сборки и в образ не попадает; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
— из окружения сессии, тот же, что в `~/abkhaz-sto/.env.production`. Секреты приложения —
`~/abkhaz-sto/.env.production`: сервисный ключ тест-Supabase,
`SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`, `STO_TICKET_*`.

## Прод (170) — sto.abkhaz-auto.ru

Хост `sto.abkhaz-auto.ru` за боевым Traefik; DNS-запись на `170.168.8.16` уже
есть. Кука сессии выдаётся сайтом на `.abkhaz-auto.ru` (`abkhaz-auto`,
`deploy/prod/build.env`), поэтому на поддомене вход работает сам: отдельного
экрана ввода кода здесь нет и не будет.

**Порядок первого выката.**

1. **Миграции.** Таблица `sto_bookings` и колонки `shops.sto_*` живут в
   `abkhaz-auto` (`supabase/migrations/20260915*`). Приложение без них не
   читает записи. Миграции применяет выкат сайта (Actions → Deploy → prod,
   blue-green применяет их до переключения трафика) — катит владелец.
   Руками в боевую базу не применять: это то же нарушение, что прямой пуш.
2. **Секреты.** `/data/abkhaz-sto/.env.production` (права 600): сервисный ключ
   боевого Supabase, `SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`,
   `STO_TICKET_SRC`/`STO_TICKET_DST`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
3. **Сеть Supabase.** Сверить имя (`docker network ls | grep supabase`) и при
   расхождении поправить `name:` в `deploy/prod/docker-compose.yml`.
4. **Сборка и запуск** (раннеров у репозитория нет — собираем на сервере):

```bash
git archive --format=tar HEAD | ssh <прод> 'mkdir -p /data/abkhaz-sto/src && tar -x -C /data/abkhaz-sto/src'
ssh <прод> 'cd /data/abkhaz-sto/src && set -a && . deploy/prod/build.env && set +a \
  && export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(grep -m1 "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" /data/abkhaz-sto/.env.production | cut -d= -f2-) \
  && docker build --secret id=npmrc,src=/data/abkhaz-sto/npmrc \
     --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
     --build-arg NEXT_PUBLIC_SITE_URL --build-arg NEXT_PUBLIC_COOKIE_DOMAIN \
     --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t abkhaz-sto:prod . \
  && docker compose -f deploy/prod/docker-compose.yml up -d \
  && shred -u /data/abkhaz-sto/npmrc'
```

`/data/abkhaz-sto/npmrc` — одна строка
`//npm.pkg.github.com/:_authToken=<токен GitHub Packages>`, права 600,
монтируется секретом сборки, в образ не попадает, удаляется сразу после.

**Что увидят люди.** Приложение открыто только владельцу одобренной витрины
рубрики `service`: без сессии — экран «Войдите на сайте», с чужой сессией —
он же. Виджет записи на самом сайте остаётся под флагом `sto_booking`, то есть
клиенты записываться не начнут, пока флаг не включат; ручная запись из
приложения работает сразу после миграций.
