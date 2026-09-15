# Абхаз Авто · Сервис

Приложение для автосервисов площадки [Абхаз Авто](https://abkhaz-auto.ru):
записи клиентов, календарь по постам, расписание и предоплата, прайс.
Отдельный Next.js-фронт над общей базой сайта (`djonua/abkhaz-auto`);
схема данных, вход, деньги и уведомления живут там (эпик
`djonua/abkhaz-auto#1265`, границы — в `AGENTS.md`).

## Экраны

| Путь | Что |
|---|---|
| `/segodnya` | записи дня по постам: подтвердить, выполнено, не приехал, отменить с причиной, перенести |
| `/kalendar` | неделя, занятость по дням, перенос записи на свободное окно |
| `/kalendar/novaya` | ручная запись клиента с улицы: услуга → окно → имя, телефон, машина |
| `/raspisanie` | часы по дням недели, перерывы, посты, шаг сетки, выходные, предоплата |
| `/uslugi` | услуги витрины: цена и длительность (от неё считаются окна) |
| `/vhod` | объяснение входа: вход на сайте, кука общая для поддоменов |

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

Хост `sto-aa.apsoftgroup.ru` за Traefik тест-сайта; куки общие с
`abkhaz-auto.apsoftgroup.ru` (домен `.apsoftgroup.ru`, см. `deploy/test/build.env`
сайта). Раннеров у репозитория пока нет, поэтому образ собирается на самом
сервере из архива исходников:

```bash
git archive --format=tar HEAD | ssh -p 22222 abkhaz-dev@185.228.132.60 \
  'mkdir -p ~/abkhaz-sto/src && tar -x -C ~/abkhaz-sto/src'
ssh -p 22222 abkhaz-dev@185.228.132.60 'cd ~/abkhaz-sto/src && set -a && . deploy/test/build.env && set +a \
  && docker build --build-arg NODE_AUTH_TOKEN --build-arg NEXT_PUBLIC_SUPABASE_URL \
     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY --build-arg NEXT_PUBLIC_SITE_URL \
     --build-arg NEXT_PUBLIC_COOKIE_DOMAIN --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
     -t abkhaz-sto:test . \
  && docker compose -f deploy/test/docker-compose.yml up -d'
```

`NODE_AUTH_TOKEN` и `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` — из окружения
сессии на сервере (первый — токен GitHub Packages, второй — тот же, что в
`~/abkhaz-sto/.env.production`). Секреты приложения —
`~/abkhaz-sto/.env.production`: сервисный ключ тест-Supabase,
`SUPABASE_INTERNAL_URL`, `SITE_INTERNAL_URL`, `STO_TICKET_*`.
