<p align="center">
  <img src="public/brand/banner.svg" alt="Nostragoalus - the football oracle" width="640">
</p>

# <img src="public/brand/mark.svg" width="36" alt="" align="top"> Nostragoalus

![Coverage](.github/coverage-badge.svg) ![License: WTFPL](https://img.shields.io/badge/License-WTFPL-brightgreen.svg)

A football score-prediction game: friends predict match scores and earn points by how close they
get, ranked per competition and on a global leaderboard. Ships with the **FIFA World Cup 2026**
(default), **World Cup 2022**, and **UEFA Euro 2024**.

Source: <https://git.arzaroth.com/Arzaroth/Nostragoalus>

## Runtimes

Built and tested on **Node.js 22** and **Bun**:

```sh
pnpm build && node .output/server/index.mjs   # or: bun .output/server/index.mjs
```

## Features

- Score predictions with closeness-tiered points, a rarity bonus, and one ×2 **joker** per round
- Optional **crowd totals** under every prediction (everyone's picks combined), updated live over WebSocket
- Transparent scoring: base + rarity bonus + joker/final ×2 broken out on every pick, with the full formula in the FAQ
- **Champion pick** bonus, locked at the first kickoff and shown beside every name on the rankings
- Per-competition **and global** rankings with movement arrows; browse other players' (locked) predictions
- Live scores over WebSocket with a pixel-art **goal celebration**; match view with possession,
  per-team match stats, goal timeline with cards (incl. touchline bookings) and substitutions,
  **all-time head-to-head** and cross-competition form (friendlies included, causally cut off at
  kickoff), penalty shootouts, and each team's top scorer / top assister
- Per-team pages: official squads with positions, manager, season stats, competition switcher
- Knockout **bracket** and an interactive **world map** (Leaflet / OpenStreetMap)
- Auth: email + password (HIBP-checked), **2FA** (TOTP, email codes, single-use backup codes,
  trusted devices), **passkeys** (sudo-gated registration), runtime-configurable **SSO** (OIDC /
  SAML / Google) with envelope-encrypted secrets, admin user management
- Four languages (EN / FR / TH / tlh), light/dark/system themes saved per account
- Auto-generated **API docs** at `/docs/api` (OpenAPI + Scalar)

## Stack

See the in-app **About** page for the full annotated list with licenses. Highlights:

- **Nuxt 4** + Vue 3 + TypeScript (Nitro `node-server`), **PrimeVue v4**, **UnoCSS**, **VueUse**,
  **motion-v**, **Nuxt I18n**
- **TanStack Vue Query** (client) + Nuxt `useFetch` (SSR)
- **better-auth** (sessions, 2FA, passkeys, SSO, admin)
- **Drizzle ORM** + **PostgreSQL** (PGlite for hermetic tests)
- Provider-agnostic match data: keyless **FIFA** and **UEFA** public APIs
- In-process scheduled tasks (Croner) for fixtures / live scores / finalize

## Scoring

Tiered base points (exact 3 / goal-difference 2 / outcome 1 / miss 0) + a rarity bonus + one ×2 joker
per round, plus a champion-pick bonus. Penalty shootouts decide who advances, never your points.

## Running with Docker

`compose.yaml` is the prod-shaped base (pinned Postgres + the multi-stage app image);
`compose.dev.yaml` overlays dev extras (maildev SMTP catcher, hot-reload container, `.env.dev`).
Migrations apply automatically on startup (`RUN_MIGRATIONS=true`). With [mise](https://mise.jdx.dev):

```bash
cp .env.example .env   # set BETTER_AUTH_SECRET, NUXT_ADMIN_EMAILS, ...
mise run up            # prod-like: app + db
mise run dev           # HMR dev server + db + maildev (inbox UI on :1080)
mise run preview       # built app + db + maildev
mise run down          # stop everything
```

(Equivalent raw commands live in `.mise.toml`.)

## Local development

```bash
docker compose up -d db     # Postgres only
pnpm install
cp .env.example .env        # then fill in secrets
pnpm db:migrate             # apply migrations
pnpm dev                    # http://localhost:3000
pnpm typecheck              # strict vue-tsc gate
pnpm test:coverage          # logic unit tests (>=98% branch coverage enforced)
pnpm test:components        # component/composable tests (Nuxt runtime)
pnpm e2e:smtp               # email-OTP end-to-end (needs mise run dev)
pnpm badge                  # refresh the coverage badge from the last run
```

`mise run check` runs the full gate (typecheck + coverage + component tests).

### First admin

There's no default admin password. Either add your email to `NUXT_ADMIN_EMAILS` and sign up normally, or provision one directly (stack must be up):

```bash
mise run create-admin you@example.com 'a-strong-password' "Your Name"
```

It signs up through better-auth (so the password is HIBP-checked and properly hashed) and sets the DB role to admin. Idempotent - re-running just promotes an existing account.
