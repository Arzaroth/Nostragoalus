# Server architecture

Nitro (Nuxt server) with file-based routes, a thin-route / fat-service split, and
typed domain errors. Read [overview.md](overview.md) first for the layering rule.

## Directory layout

```
server/
  api/                      Nitro file-based routes -> server/api/<path>/<name>.<method>.ts
    admin/                  admin-only endpoints (leagues, users, sso, api-keys,
                            settings, scoring, matches/media, roadmap, cron, run-task)
    auth/[...all].ts        better-auth catch-all (auto-wired)
    matches/                match detail: live-detail, timeline, insights, ...
    predictions/            index.put (save), joker.put, crowd.get
    leaderboard/index.get.ts
    leagues/                public league ops: join.post, leave.post, [id]/chat/*
    notifications/          index.get, read.post, delete.post
    push/                   subscribe.post, unsubscribe.post
    champion/, best-scorer/, share/, commitments/, sso/ ...
  routes/                   non-/api routes: _ws.ts (WebSocket), og/share/[token].get.ts,
                            verify/ (public ledger page data)
  middleware/               passkey-guard.ts, skin.ts (run on every request)
  plugins/                  migrate.ts, warm-settings.ts (run at startup)
  tasks/                    Nitro file-based scheduled tasks (media/migrate-blobs.ts, ...)
  utils/                    ALL domain logic (the covered surface)
    errors.ts               domain error classes
    http.ts                 toHttpError mapping (coverage-excluded)
    validated-handler.ts    defineValidatedHandler (auth + zod)
    auth-guards.ts          requireUser / requireAdmin / requireApiKey
    tasks/registry.ts       TASKS array + TaskDef (cron schedule source of truth)
    <feature>/service.ts    domain services (predictions, leagues, chat, scoring, ...)
    live/                   WebSocket hub + publishers (see realtime.md)
    crypto/                 envelope encryption for SSO secrets (see auth.md)
    auth/, providers/, storage/, share/, push/, notifications/, commitment/, odds/ ...
```

## The service pattern

Every service function takes `AppDatabase` (alias of Drizzle's
`PgDatabase<...>`, defined in `db/types.ts`) as its first parameter and throws
the error classes from `errors.ts`. Routes import the singleton `db` from
`db/index.ts` and call services.

```ts
// server/utils/<feature>/service.ts
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
(`server/utils/http.ts`) maps each class:

| Error class | Status | Meaning |
|---|---|---|
| `ValidationError` | 400 | bad input the zod schema can't express |
| `ForbiddenError` | 403 | authenticated but not allowed |
| `NotFoundError` | 404 | entity missing (or hidden, to avoid existence leaks) |
| `LockedError` | 409 | match already kicked off (prediction past lock) |
| `JokerQuotaError` | 409 | the round's single ×2 joker is already used |
| `ConflictError` | 409 | generic conflict |
| `StorageError` | 500 | blob backend failure (message is generic, never leaks the path) |

A unique-violation from Postgres is also mapped to 409 (covers PK races).
Unhandled errors pass through unchanged.

## defineValidatedHandler

The standard wrapper for mutations: it enforces auth, zod-validates the body, and
exposes the validated body + session user to the handler.

```ts
// server/api/predictions/index.put.ts
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
  (used by ingestion/automation routes). See [auth.md](auth.md).

## defineRouteMeta (OpenAPI)

Every route carries `defineRouteMeta({ openAPI: { ... } })` (tags, summary,
request body, responses). This drives the generated docs at
`/_docs/openapi.json`. Keep it in sync when a route's contract changes.

## Startup plugins

- `server/plugins/migrate.ts` - when `RUN_MIGRATIONS=true`, runs the Drizzle
  node-postgres migrator against `./drizzle` on boot. See
  [database.md](database.md) for the shared-dev-DB migrator caveat.
- `server/plugins/warm-settings.ts` - pre-loads the email-verification flag from
  the DB so sign-in/sign-up see the correct state immediately.

## Request middleware

- `server/middleware/passkey-guard.ts` - guards passkey-registration endpoints
  behind a fresh reauth (`ng_reauth` cookie). See [auth.md](auth.md).
- `server/middleware/skin.ts` - seeds the cosmetic skin for SSR. See
  [../features/easter-eggs.md](../features/easter-eggs.md).

## Scheduled tasks

The cron schedule lives in `server/utils/tasks/registry.ts` as a `TASKS` array of
`{ name, cron, fireAndForget }`. `null` cron = manual-only (triggered from the
admin Background-tasks page via `server/api/admin/run-task.post.ts`).

| Task | Cron | Purpose |
|---|---|---|
| `scores:poll` | every 2 min (live-gated) | poll live scores, publish changes, fire live push |
| `fixtures:refresh` | hourly | refresh fixtures from the provider |
| `predictions:sync` / `matches:finalize` | every 5 min | derive goal events + possession |
| `odds:refresh` | every 30 min (fire-and-forget) | refresh odds snapshots |
| `notifications:send-reminders` | every 15 min | PICK_REMINDER scheduling |
| `users:prune-unverified` | daily | drop never-verified signups |
| `notifications:prune` | daily | retention (read >7d, cap 200) |
| `predictions:finalize` | manual | idempotent scoring of a finished match |
| `media:migrate-blobs` | manual | move image blobs Postgres -> storage |

Exact cron strings and the full list are in the registry. Finalize is the
heart of scoring: see [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md).

## Sources

- `server/api/**`, `server/routes/**`, `server/middleware/**`, `server/plugins/**`
- `server/utils/errors.ts`, `server/utils/http.ts`, `server/utils/validated-handler.ts`, `server/utils/auth-guards.ts`
- `server/utils/tasks/registry.ts`
- `db/types.ts`, `db/index.ts`
