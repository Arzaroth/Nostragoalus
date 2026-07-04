# Testing and the merge gate

Nothing merges without a green gate. This file is what the gate runs, how
coverage is scoped, and the test harness for services and components.

## The gate

Run individually (beware zsh pipelines masking exit codes - check steps
separately or `set -o pipefail`), or all at once with `mise run check`:

1. `pnpm typecheck` - Nuxt/vue-tsc type check.
2. `pnpm test:coverage` - the unit project (node env) with the **98%** coverage
   threshold enforced (lines, functions, statements, branches).
3. `pnpm test:components` - the nuxt project (components and composables).
4. `pnpm build` - the prod SSR/rollup build. It catches unresolved-import link
   errors the other steps miss (import shared via the `#shared` alias, not deep
   `../../../../shared/*`, from nested route pages).

## Coverage scope (and why it shapes the code)

`vitest.config.ts` defines two projects:

- **unit** (`name: 'unit'`, node env) - includes
  `{server,lib,db,shared,tests,app}/**/*.test.ts`, excludes `*.nuxt.test.ts`.
  This project carries the coverage gate.
- **nuxt** (`name: 'nuxt'`, Nuxt env) - includes `app/**/*.nuxt.test.ts`. No
  coverage is collected here.

Coverage **includes** the three logic surfaces: `server/utils/**`, `shared/**`,
`app/utils/**`. It **excludes**: `*.test.ts`, `**/types/**`, the runtimeConfig
glue files `server/utils/providers/index.ts` and `server/utils/storage/index.ts`,
`server/utils/http.ts`, `server/utils/share/og-assets.ts` (storage + Google Fonts
fetch glue, covered via the OG routes), and `app/utils/image.ts` (canvas/Image DOM
glue with no headless surface).

The gate covers logic dirs only, NOT `server/api` routes, `server/tasks`, or
`app/pages`. That is the whole reason routes and pages stay thin and logic lives
in services (see [overview.md](overview.md) and [server.md](server.md)).

## Service tests (pglite)

`tests/db.ts` `createTestDb()` spins up an in-memory Postgres via
`@electric-sql/pglite` and runs the **real** Drizzle migrations from `./drizzle`,
so service tests exercise the actual schema, constraints and enums (see
[database.md](database.md)).

`tests/factories.ts` provides builders: `makeUser`, `makeCompetition`,
`seedCompetition`, `makeMatch`, `makePrediction`, `makeLeague`, `addLeagueMember`,
`makeReaction`. `tests/storage.ts` provides `memoryStorage()` for services that
touch image blobs (see [storage.md](storage.md)).

## Component tests

`*.nuxt.test.ts` files use `mountSuspended` from `@nuxt/test-utils`. Two rules
that prevent order-dependent flakes:

- Unmount what you mount.
- Clear the vue-query cache between tests. Leaked observers plus the app-level
  60s `staleTime` (see [client.md](client.md)) have both caused flakes where a
  later test reads a previous test's cached data.

## End-to-end (Playwright)

A browser e2e suite runs OUT-OF-BAND from the 98% merge gate: it needs a Docker
stack, so it is not part of `mise run check` / `pnpm test:coverage`. Run it with
`mise run e2e` (which brings the stack up via `e2e-up`; tear it down afterward
with `e2e-down`); specs live under `tests/e2e/**`, configured by `playwright.config.ts`.
It exercises full flows the unit and component tests cannot: predict -> finalize
-> leaderboard, the password-reset and delete-account mail flows (against maildev),
SSO/OIDC login (against a dockerized Keycloak IdP, trusted via
`NUXT_SSO_TRUSTED_ORIGINS` - see [auth.md](auth.md)), and the meta-pick pickers
(`tests/e2e/pickers.e2e.ts` drives the champion and best-scorer pickers in a real
browser, asserting the shared `MetaPickShowcase` frame reacts to a live pick). It
runs against an isolated, disposable stack - the `ng-e2e` compose project with
shifted ports and its OWN empty database - so it never touches dev pgdata.

`tests/e2e/global-setup.ts` makes the suite reproducible from that empty DB: it
waits for the app, warms the cold HMR routes the first specs hit (a route compiles
on first request under the dev server), ensures the admin account, pins email
verification on via the admin API, and seeds the default `scoring_config` (also
seeded app-side on boot - see [server.md](server.md)). `nuxt.config.ts`
`vite.optimizeDeps.include` pre-bundles the client deps Vite would otherwise
discover mid-session and respond to with a full reload, which would drop an
in-flight sign-up POST or verify-email navigation and flake the browser run.

## Sources

- `vitest.config.ts`, `package.json` (scripts), `mise-tasks/release`, `.mise.toml` (`check`)
- `tests/db.ts`, `tests/factories.ts`, `tests/storage.ts`
- `playwright.config.ts`, `tests/e2e/**` (incl. `tests/e2e/README.md`, `global-setup.ts`, `pickers.e2e.ts`), `.env.e2e`, `compose.e2e.yaml`
- `nuxt.config.ts` (`vite.optimizeDeps.include` dev pre-bundle)
