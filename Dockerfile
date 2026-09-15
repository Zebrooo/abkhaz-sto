FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# ---------- deps ----------
FROM base AS deps
# .npmrc привязывает @zebrooo к GitHub Packages. Токен — СЕКРЕТОМ СБОРКИ, а не
# ARG/ENV: pnpm 10 не подставляет ${NODE_AUTH_TOKEN} в учётные данные проектного
# .npmrc (ERR_PNPM_FETCH_401 на тест-стенде 15.09.2026), а секрет не попадает в
# слои образа. Файл секрета — одна строка:
#   //npm.pkg.github.com/:_authToken=<токен>
# и монтируется как пользовательский npmrc:
#   docker build --secret id=npmrc,src=<путь к файлу> …
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* запекается в бандл ЗДЕСЬ: домен куки обязан совпадать с сайтом,
# иначе сервер и браузер разойдутся (см. src/lib/auth-cookies.ts).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_COOKIE_DOMAIN
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_COOKIE_DOMAIN=$NEXT_PUBLIC_COOKIE_DOMAIN
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN pnpm build
# Карты исходников остаются в образе для разбора ошибок, наружу не отдаются.
RUN mkdir -p /sourcemaps && find .next/static -name '*.map' -exec sh -c 'mkdir -p "/sourcemaps/$(dirname "$1")" && mv "$1" "/sourcemaps/$1"' _ {} \;

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder /sourcemaps /sourcemaps
USER app
EXPOSE 3000
CMD ["node", "server.js"]
