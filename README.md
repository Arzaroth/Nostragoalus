<p align="center">
  <img src="public/brand/banner.svg" alt="Nostragoalus — the football oracle" width="640">
</p>

# Nostragoalus

A football score-prediction game: friends predict match scores and earn points by how close they
get, ranked per competition and on a global leaderboard. Ships with the **FIFA World Cup 2026**
(default), **World Cup 2022**, and **UEFA Euro 2024**.

## Features

- Score predictions with closeness-tiered points, a rarity bonus, and one ×2 **joker** per round
- **Champion pick** bonus, locked at the first kickoff
- Per-competition **and global** rankings; browse other players' (locked) predictions
- Live scores over WebSocket; match view with possession, cards, attendance, goal timeline, penalty
  shootout, and each team's top scorer / top assister
- Knockout **bracket** projection and an interactive **world map** (Leaflet / OpenStreetMap)
- Per-team pages, fixture search, EN/FR i18n, light/dark themes, Google or email sign-in

## Stack

- **Nuxt 4** + Vue 3 + TypeScript (Nitro `node-server`)
- **PrimeVue v4** + **UnoCSS**
- **TanStack Vue Query** (client) + Nuxt `useFetch` (SSR)
- **better-auth** (email + password, optional Google)
- **Drizzle ORM** + **Postgres**
- Provider-agnostic match data: keyless **FIFA API** (default) or **football-data.org**
- In-process scheduled tasks (Croner) for fixtures / live scores / finalize

## Scoring

Tiered base points (exact 3 / goal-difference 2 / outcome 1 / miss 0) + a rarity bonus + one ×2 joker
per round, plus a champion-pick bonus. Scored on the 90-minute full-time result.

## Running with Docker (production build)

`compose.yaml` builds the multi-stage production image and runs it alongside Postgres. Database
migrations are applied automatically on startup (`RUN_MIGRATIONS=true`).

```bash
cp .env.example .env        # set BETTER_AUTH_SECRET, NUXT_ADMIN_EMAILS (+ optional provider / Google keys)
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
pnpm test:coverage          # unit tests (>=98% coverage enforced)
```
