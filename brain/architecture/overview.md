# Architecture overview

Big picture: how a request flows, where logic lives, and the layering rules that
keep the test gate green. Read this first, then jump to the specific layer file.

## What it is

A score-prediction game (branded **Nostragoalus**, repo dir `nostragoalus`).
Friends predict match scores, earn points by closeness, ranked **per
competition**. Multi-competition by design (add a `competition` row, no rebuild);
the default competition is the FIFA World Cup 2026. Football is the default
sport, not the only one: a competition's `sport` (`FOOTBALL` / `RUGBY_UNION`)
picks its provider, scoring and ranking. See
[../features/competitions.md](../features/competitions.md),
[../features/rugby.md](../features/rugby.md) and the product glossary in
[../glossary.md](../glossary.md).

## Layering (the cardinal rule)

```
HTTP route (thin)  ->  service (all logic)  ->  Drizzle / AppDatabase  ->  Postgres
   apps/web-nuxt/server/api/**       apps/web-nuxt/server/utils/<feat>/service.ts
```

- **Routes are thin.** They validate input, call one or more service functions,
  and map thrown domain errors to HTTP. No business logic in a route.
- **Logic lives in services** under `apps/web-nuxt/server/utils/<feature>/service.ts`, each
  function taking `AppDatabase` as its first parameter and throwing the error
  classes from `apps/web-nuxt/server/utils/errors.ts`.
- **Why:** the coverage gate (98%) is enforced only on `apps/web-nuxt/server/utils/**`,
  `apps/web-nuxt/shared/**`, `apps/web-nuxt/app/utils/**` - NOT on `apps/web-nuxt/server/api` routes or `apps/web-nuxt/app/pages`. Keeping
  routes/pages thin enough to not need direct coverage is how the gate stays
  achievable. See [testing.md](testing.md).

## The four code surfaces

| Surface | Path | Covered by gate? | What's here |
|---|---|---|---|
| Server logic | `apps/web-nuxt/server/utils/**` | yes (98%) | services, scoring, providers, auth glue, tasks |
| Shared isomorphic | `apps/web-nuxt/shared/**` | yes (98%) | types, commitment crypto, pure helpers used both sides |
| Client logic | `apps/web-nuxt/app/utils/**` | yes (98%) | formatters, pure UI helpers |
| Thin edges | `apps/web-nuxt/server/{api,routes,middleware,plugins,tasks}/**`, `apps/web-nuxt/app/pages/**`, `*.vue` | no | routes, Nitro middleware/plugins/tasks, pages, components |

`#shared` is the import alias for `apps/web-nuxt/shared/**` - use it from nested route pages,
not deep `../../../../shared/*`, or the SSR/rollup build fails on link errors.

## Request lifecycle (server)

1. Nitro file-based route in `apps/web-nuxt/server/api/**` matches (e.g.
   `predictions/index.put.ts`).
2. A mutation's `defineValidatedHandler` enforces auth (session user / admin, or
   an API key where the route opts in), rejects a cross-origin cookie-session
   request (CSRF), and zod-validates the body; a read's `defineReadHandler` does
   optional auth and zod-validates the query string. See [server.md](server.md).
3. The handler calls a service function with the singleton `db`.
4. The service does the work, throwing typed errors on failure.
5. Both wrappers pass a thrown domain error through `toHttpError`
   (`apps/web-nuxt/server/utils/http.ts`) for the right status code, and parse
   the return through the zod `response` schema (required on reads, optional on
   mutations); `defineRouteMeta` documents the route for OpenAPI. See
   [cross-stack-contract.md](cross-stack-contract.md).

## Client lifecycle

- SSR renders the page; **TanStack vue-query** composables
  (`apps/web-nuxt/app/composables/use<Feature>.ts`) own client data with hierarchical query
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
| Peer-to-peer voice (WebRTC, TURN) | [webrtc.md](webrtc.md) |
| E2EE chat/DM threat model | [e2ee-trust-model.md](e2ee-trust-model.md) |
| Pluggable image storage (fs/s3) | [storage.md](storage.md) |
| OG/share images + PWA service worker | [rendering.md](rendering.md) |
| External data: FIFA/UEFA/ESPN/World Rugby match data, odds, rankings | [providers.md](providers.md) |
| Daily live-feed shape canary | [provider-canary.md](provider-canary.md) |
| Test gate, coverage, pglite, factories | [testing.md](testing.md) |
| i18n, five locales | [i18n.md](i18n.md) |
| Right-to-left (Arabic) mechanics | [rtl.md](rtl.md) |
| OpenAPI contract + golden vectors for the Dart client | [cross-stack-contract.md](cross-stack-contract.md) |
| Client-JS bundle fingerprint | [build-integrity.md](build-integrity.md) |
| Deployed containers, memory cap, heap diagnosis | [runtime.md](runtime.md) |

## Hard rules that shape the code

(Full list in the repo's `CLAUDE.md`; the architecturally load-bearing ones:)

- async/await + try/catch, never `.then/.catch`.
- Every user-facing string is i18n'd in all five locales.
- A finished feature branch goes through feature-treatment (rebase -> parallel
  review -> fix -> gate -> merge -> release -> remove worktree).
- The merge gate (run from `apps/web-nuxt`): `pnpm typecheck`, `pnpm test:coverage`,
  `pnpm test:components`, `pnpm build` (the build catches SSR/rollup link errors the
  others miss).

## Sources

- `CLAUDE.md` (hard rules, gate)
- `apps/web-nuxt/vitest.config.ts` (coverage include + thresholds)
- `apps/web-nuxt/server/utils/validated-handler.ts`, `apps/web-nuxt/server/utils/read-handler.ts`, `apps/web-nuxt/server/utils/http.ts`, `apps/web-nuxt/server/utils/errors.ts`
- `apps/web-nuxt/db/app-schema.ts` (`competition`, `sportEnum`)
