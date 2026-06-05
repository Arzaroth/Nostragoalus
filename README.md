# MPP — Mon Petit Prono (FIFA World Cup 2026)

A football score-prediction game: friends predict match scores and earn points by how close they
get, ranked on a single global leaderboard. First scope is the **FIFA World Cup 2026**.

## Stack

- **Nuxt 4** + Vue 3 + TypeScript (Nitro server)
- **PrimeVue v4** + **UnoCSS**
- **TanStack Vue Query** (client) + Nuxt `useAsyncData` (SSR)
- **better-auth** (email + password)
- **Drizzle ORM** + **Postgres**
- Provider-agnostic match data (football-data.org / API-Football)
- In-process score polling via Nitro scheduled tasks (Croner) — single long-running `node-server`

## Scoring (MPP-style)

Tiered base points (exact 3 / goal-difference 2 / outcome 1 / miss 0) + a rarity bonus + one ×2 joker
per round. Scored on the 90-minute full-time result.

## Running with Docker (production build)

`compose.yaml` builds the multi-stage production image and runs it alongside Postgres. Database
migrations are applied automatically on startup (`RUN_MIGRATIONS=true`).

```bash
cp .env.example .env        # set BETTER_AUTH_SECRET, NUXT_ADMIN_EMAILS, a provider token
docker compose up --build   # Postgres + prod app at http://localhost:3000
docker compose down         # stop (add -v to also wipe the database volume)
```

Optional hot-reloading dev container: `docker compose --profile dev up app-dev`.

## Local development

```bash
docker compose up -d db     # Postgres only
pnpm install
cp .env.example .env        # then fill in secrets
pnpm db:migrate             # apply migrations
pnpm dev                    # http://localhost:3000
pnpm test:coverage          # unit tests (>=95% coverage enforced)
```
