# Server architecture

Nitro (Nuxt server) with file-based routes, a thin-route / fat-service split, and
typed domain errors. Read [overview.md](overview.md) first for the layering rule.

## Directory layout

```
apps/web-nuxt/server/
  api/                      Nitro file-based routes -> apps/web-nuxt/server/api/<path>/<name>.<method>.ts
    admin/                  admin-only endpoints (leagues, users, sso, api-keys,
                            settings, scoring, matches, odds, roadmap, cron, run-task)
    auth/[...all].ts        better-auth catch-all (auto-wired)
    matches/                match detail: live-detail, timeline, insights, ...
    predictions/            index.put (save), joker.put, crowd.get
    leaderboard/index.get.ts
    leagues/                public league ops: join.post, leave.post, [id]/chat/*
    notifications/          index.get, read.post, delete.post
    push/                   subscribe.post, unsubscribe.post
    champion/, best-scorer/, share/, commitments/, sso/ ...
  routes/                   non-/api routes: _ws.ts (WebSocket), og/{share,wrapped,profile,analytics}/[token].get.ts,
                            docs/ (filtered OpenAPI JSON + Scalar UI), .well-known/ (App Links),
                            download/[apk].get.ts, build-integrity.json.get.ts
  middleware/               client-version.ts, passkey-guard.ts, skin.ts (run on every request)
  plugins/                  assert-secret.ts, migrate.ts, warm-settings.ts (run at startup)
  tasks/                    Nitro file-based scheduled tasks (media/migrate-blobs.ts, ...)
  utils/                    ALL domain logic (the covered surface)
    errors.ts               domain error classes
    http.ts                 toHttpError mapping (coverage-excluded)
    validated-handler.ts    defineValidatedHandler (auth + CSRF + zod body/response)
    read-handler.ts         defineReadHandler (optional auth + zod query/response)
    auth-guards.ts          requireUser / requireAdmin / requireApiKey
    tasks/registry.ts       TASKS array + TaskDef (cron schedule source of truth)
    <feature>/service.ts    domain services (predictions, leagues, chat, scoring, ...)
    live/                   WebSocket hub + publishers (see realtime.md)
    crypto/                 envelope encryption for SSO secrets (see auth.md)
    auth/, providers/, storage/, share/, push/, notifications/, commitment/, odds/ ...
```

## The service pattern

Every service function takes `AppDatabase` (alias of Drizzle's
`PgDatabase<...>`, defined in `apps/web-nuxt/db/types.ts`) as its first parameter and throws
the error classes from `errors.ts`. Routes import the singleton `db` from
`apps/web-nuxt/db/index.ts` and call services.

```ts
// apps/web-nuxt/server/utils/<feature>/service.ts
import type { AppDatabase } from '../../../db/types'
import { ValidationError, NotFoundError } from '../errors'

export async function getEntity(db: AppDatabase, id: string) {
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1)
  return row ?? null
}

export async function createEntity(db: AppDatabase, input: Input) {
  if (invalid) throw new ValidationError('reason')
  return db.transaction(async (tx) => { /* multi-step writes stay atomic */ })
}
```

This is the only surface the 98% coverage gate measures, which is why all real
logic lives here and routes stay thin. See [testing.md](testing.md).

## Errors -> HTTP

Services throw; routes never build status codes by hand. `toHttpError`
(`apps/web-nuxt/server/utils/http.ts`) maps each class:

| Error class | Status | Meaning |
|---|---|---|
| `ValidationError` | 400 | bad input the zod schema can't express |
| `ForbiddenError` | 403 | authenticated but not allowed |
| `NotFoundError` | 404 | entity missing (or hidden, to avoid existence leaks) |
| `LockedError` | 409 | match already kicked off (prediction past lock) |
| `JokerQuotaError` | 409 | the round's single ×2 joker is already used |
| `ConflictError` | 409 | generic conflict |
| `SsoNotReadyError` | 409 | SSO provider not ready to enable (no passing connection test, or domain unverified) |
| `ProviderError` | 502 | an upstream feed failed or answered garbage (upstream text stays on `cause`) |
| `StorageError` | 500 | blob backend failure (message is generic, never leaks the path) |

A unique-violation from Postgres (`23505`, also found on `cause`) is also mapped
to 409 (covers PK races).
Unhandled errors pass through unchanged.

## defineValidatedHandler

The standard wrapper for mutations: it enforces auth, rejects a cross-origin
cookie-session mutation (`assertSameOrigin`, `apps/web-nuxt/server/utils/csrf.ts`;
API-key callers skip it), zod-validates the body (422 with the issue paths on
failure), maps domain errors through `toHttpError`, and exposes the validated body
+ user to the handler.

```ts
// apps/web-nuxt/server/api/predictions/index.put.ts
const bodySchema = z.object({
  matchId: z.string().uuid(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  return { id: await upsertPrediction(db, { userId: user.id, ...body }) }
})
```

Options:
- `body` - a zod schema; an invalid body is rejected before the handler runs.
- `admin: true` - require an admin session (otherwise any signed-in user).
- `apiKey: { resource: ['scope'] }` - also accept an `x-api-key` with those scopes
  (used by ingestion/automation routes). A key sent to a route without this
  option is a 401. See [auth.md](auth.md).
- `response` - a zod schema the return is parsed through before it leaves; a
  drift is a 500 `Response contract violation`, and typecheck pins the handler's
  return to `z.input` of it.

Reads use `defineReadHandler` (`apps/web-nuxt/server/utils/read-handler.ts`):
public by default (`auth: 'user' | 'admin'` opts in), an optional zod `query`
(422 on failure), and a **required** `response` schema. Both wrappers tag the
handler with its zod contract for the OpenAPI emitter; see
[cross-stack-contract.md](cross-stack-contract.md).

## defineRouteMeta (OpenAPI)

Every route carries `defineRouteMeta({ openAPI: { ... } })` (tags, summary,
request body, responses). This drives Nitro's generated spec at
`/_docs/openapi.json` (`nuxt.config.ts` `nitro.openAPI`); the public
`/docs/openapi.json` route strips it to `/api/*` and merges sampled GET response
schemas, with the Scalar UI at `/docs/api`. Keep it in sync when a route's
contract changes.

## Startup plugins

- `apps/web-nuxt/server/plugins/assert-secret.ts` - in production, refuses to boot
  when the auth secret (`BETTER_AUTH_SECRET` / `NUXT_BETTER_AUTH_SECRET` /
  runtime config) is shorter than 32 chars, since sessions and every signed
  capability token key off it.
- `apps/web-nuxt/server/plugins/migrate.ts` - when `RUN_MIGRATIONS=true`, runs the Drizzle
  node-postgres migrator against `./drizzle` on boot. See
  [database.md](database.md) for the shared-dev-DB migrator caveat.
- `apps/web-nuxt/server/plugins/warm-settings.ts` - pre-loads the email-verification flag from
  the DB so sign-in/sign-up see the correct state immediately, and seeds a default
  `scoring_config` (idempotent `ensureDefaultScoringConfig`) so a freshly migrated
  DB is usable before any `fixtures:import` (the scoring-dependent routes would
  otherwise throw "no active scoring config").

## Request middleware

- `apps/web-nuxt/server/middleware/client-version.ts` - answers 426 to an Android
  build older than the server's floor (`x-ng-client` header). See
  [../features/mobile-app.md](../features/mobile-app.md).
- `apps/web-nuxt/server/middleware/passkey-guard.ts` - guards passkey-registration endpoints
  behind a fresh reauth (`ng_reauth` cookie). See [auth.md](auth.md).
- `apps/web-nuxt/server/middleware/skin.ts` - seeds the cosmetic skin for SSR. See
  [../features/easter-eggs.md](../features/easter-eggs.md).

## Scheduled tasks

The cron schedule lives in `apps/web-nuxt/server/utils/tasks/registry.ts` as a `TASKS` array of
`{ name, cron, fireAndForget }`. `null` cron = manual-only (triggered from the
admin Background-tasks page via `apps/web-nuxt/server/api/admin/run-task.post.ts`).
Each task checks `cronDisabled` (`apps/web-nuxt/server/utils/tasks/cron-gate.ts`)
first: `NUXT_CRON_ENABLED=false` stops every scheduled run, while a manual trigger
(`payload.force`) still goes through.

| Task | Cron | Purpose |
|---|---|---|
| `scores:poll` | every 30s (live-gated) | poll live scores, publish changes, fire live push |
| `fixtures:refresh` | hourly | refresh fixtures from the provider |
| `matches:finalize` | every 1 min | lock predictions at kickoff, score finished matches |
| `odds:refresh` | every 30 min (fire-and-forget) | refresh odds snapshots |
| `notifications:pick-reminders` | every 15 min | PICK_REMINDER scheduling |
| `users:prune-unverified` | daily | drop unverified signups older than 7 days (only while verification is required) |
| `notifications:prune` | daily | retention (read >7d, cap 200) |
| `fixtures:import` / `*:backfill` | manual | one-shot fixture import and odds/rank/badge backfills |
| `media:migrate-blobs` | manual | move image blobs Postgres -> storage |

Exact cron strings and the full list are in the registry. `matches:finalize` is
the heart of scoring: see [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md).

## Sources

- `apps/web-nuxt/server/api/**`, `apps/web-nuxt/server/routes/**`, `apps/web-nuxt/server/middleware/**`, `apps/web-nuxt/server/plugins/**`
- `apps/web-nuxt/server/utils/errors.ts`, `apps/web-nuxt/server/utils/http.ts`, `apps/web-nuxt/server/utils/validated-handler.ts`, `apps/web-nuxt/server/utils/read-handler.ts`, `apps/web-nuxt/server/utils/csrf.ts`, `apps/web-nuxt/server/utils/auth-guards.ts`
- `apps/web-nuxt/server/utils/tasks/registry.ts`, `apps/web-nuxt/server/utils/tasks/cron-gate.ts`
- `apps/web-nuxt/nuxt.config.ts` (`nitro.openAPI`), `apps/web-nuxt/server/routes/docs/openapi.json.get.ts`
- `apps/web-nuxt/db/types.ts`, `apps/web-nuxt/db/index.ts`
