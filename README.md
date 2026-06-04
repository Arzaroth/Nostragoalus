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

## Development

```bash
pnpm install
cp .env.example .env   # then fill in secrets
pnpm dev               # http://localhost:3000
pnpm test:coverage     # unit tests (>=95% coverage enforced)
```
