# Architecture overview

Big picture: how a request flows, where logic lives, and the layering rules that
keep the test gate green. Read this first, then jump to the specific layer file.

## What it is

A football score-prediction game (branded **Nostragoalus**, repo dir `nostragoalus`).
Friends predict match scores, earn points by closeness, ranked **per
competition**. Multi-competition by design (add a `competition` row, no rebuild);
first competition is the FIFA World Cup 2026. See
[../features/competitions.md](../features/competitions.md) and the product
glossary in [../glossary.md](../glossary.md).

## Layering (the cardinal rule)

```
HTTP route (thin)  ->  service (all logic)  ->  Drizzle / AppDatabase  ->  Postgres
   server/api/**       server/utils/<feat>/service.ts
```

- **Routes are thin.** They validate input, call one or more service functions,
  and map thrown domain errors to HTTP. No business logic in a route.
- **Logic lives in services** under `server/utils/<feature>/service.ts`, each
  function taking `AppDatabase` as its first parameter and throwing the error
  classes from `server/utils/errors.ts`.
- **Why:** the coverage gate (98%) is enforced only on `server/utils/**`,
  `shared/**`, `app/utils/**` - NOT on `server/api` routes or `app/pages`. Keeping
  routes/pages thin enough to not need direct coverage is how the gate stays
  achievable. See [testing.md](testing.md).

## The four code surfaces

| Surface | Path | Covered by gate? | What's here |
|---|---|---|---|
| Server logic | `server/utils/**` | yes (98%) | services, scoring, providers, auth glue, tasks |
| Shared isomorphic | `shared/**` | yes (98%) | types, commitment crypto, pure helpers used both sides |
| Client logic | `app/utils/**` | yes (98%) | formatters, pure UI helpers |
| Thin edges | `server/api/**`, `server/tasks/**`, `app/pages/**`, `*.vue` | no | routes, Nitro tasks, pages, components |

`#shared` is the import alias for `shared/**` - use it from nested route pages,
not deep `../../../../shared/*`, or the SSR/rollup build fails on link errors.

## Request lifecycle (server)

1. Nitro file-based route in `server/api/**` matches (e.g.
   `predictions/index.put.ts`).
2. `defineValidatedHandler` enforces auth (session user / admin / API key) and
   zod-validates the body. See [server.md](server.md).
3. The handler calls a service function with the singleton `db`.
4. The service does the work, throwing typed errors on failure.
5. `toHttpError` (`server/utils/http.ts`) maps a thrown domain error to the right
   status code; `defineRouteMeta` documents the route for OpenAPI.

## Client lifecycle

- SSR renders the page; **TanStack vue-query** composables
  (`app/composables/use<Feature>.ts`) own client data with hierarchical query
  keys and invalidate-on-mutation. See [client.md](client.md).
- A reconnecting WebSocket (`/_ws`) feeds live updates (scores, chat, presence,
  notifications) into the cache. See [realtime.md](realtime.md).

## Cross-cutting subsystems

| Subsystem | File |
|---|---|
| Server routes, services, errors, validation, tasks | [server.md](server.md) |
| Nuxt client, pages, composables, components | [client.md](client.md) |
| Schema, migrations, test DB | [database.md](database.md) |
| better-auth, SSO, passkeys, 2FA, API keys, admin | [auth.md](auth.md) |
| WebSocket hub, live push, presence | [realtime.md](realtime.md) |
| Pluggable image storage (fs/s3) | [storage.md](storage.md) |
| OG/share images + PWA service worker | [rendering.md](rendering.md) |
| External data: FIFA match data, odds, FIFA ranking | [providers.md](providers.md) |
| Test gate, coverage, pglite, factories | [testing.md](testing.md) |
| i18n, five locales | [i18n.md](i18n.md) |

## Hard rules that shape the code

(Full list in the repo's `CLAUDE.md`; the architecturally load-bearing ones:)

- async/await + try/catch, never `.then/.catch`.
- Every user-facing string is i18n'd in all five locales.
- A finished feature branch goes through feature-treatment (rebase -> parallel
  review -> fix -> gate -> merge -> release -> remove worktree).
- The merge gate: `pnpm typecheck`, `pnpm test:coverage`, `pnpm test:components`,
  `pnpm build` (the build catches SSR/rollup link errors the others miss).
