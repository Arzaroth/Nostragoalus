# Nostragoalus - project instructions

## Hard rules

- Dependencies change through `pnpm add/remove/update` only - never hand-edit
  `package.json`.
- DB schema changes go through `db/app-schema.ts` + `pnpm db:generate` - never
  hand-write migration SQL into `drizzle/`.
- Every user-facing string gets i18n keys in **all four locales**
  (`i18n/locales/{en,fr,th,tlh}.json`) - tlh is Klingon, keep it terse and
  in-character.
- The gate before any merge: `pnpm typecheck`, `pnpm test:coverage` (98%
  thresholds, enforced), `pnpm test:components`. Beware zsh pipelines masking
  exit codes (`typecheck | tail` reports success) - `set -o pipefail` or check
  steps separately.
- async/await + try/catch, not `.then/.catch`. Comments explain WHY only, and
  rarely - never narrate code or talk to the reviewer.
- Commit frequently and focused (conventional commits); each slice should be
  revertable on its own.

## Conventions (match the existing shape)

- Server: routes are thin, logic lives in `server/utils/<feature>/service.ts`
  taking `AppDatabase` as first param and throwing the error classes from
  `server/utils/errors.ts`. Mutations use `defineValidatedHandler` (zod body,
  `admin: true` for admin routes, `toHttpError` mapping). Every route carries
  `defineRouteMeta` OpenAPI docs.
- Client: TanStack vue-query composables (`app/composables/use<Feature>.ts`),
  hierarchical query keys, invalidate on mutation success. Note the app-level
  `staleTime: 60_000`.
- Tests: services against pglite (`tests/db.ts` `createTestDb` runs the real
  migrations) + `tests/factories.ts`; components as `*.nuxt.test.ts` with
  `mountSuspended`. Unmount what you mount and clear the query cache between
  tests - leaked observers and the 60s staleTime have both caused
  order-dependent flakes.
- Local stack: `mise run dev` (HMR) / `mise run preview` (prod-target build,
  what you use to demo a branch). Worktree previews need `.env` copied from
  the main checkout or auth 500s on the default secret.

## Keep the planning docs current as you work

- **TODO.md** (tech debt, deferred work): tick items your change resolves, in
  the same commit or PR. When a review or feature pass defers something, add
  it under the matching section with enough context to act on later. New
  feature = new debt section if it left any.
- **ROADMAP.md** (feature backlog + design notes): tick items when they ship
  (note the release version). When a feature is discussed and decisions are
  made, capture them on the item - decisions not written down are lost.
  When starting a feature, also seed it as IN_PROGRESS in
  `mise-tasks/roadmap-seed` and mention the public title/description so it
  can be added to the prod roadmap.
- Both files live on `main`; update them there even when feature work happens
  in a worktree branch.
- Surprise/secret features stay out of every committed doc (changelog,
  ROADMAP.md, seeds) - track them in session memory only.
