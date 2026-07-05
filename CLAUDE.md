# Nostragoalus - project instructions

## Hard rules

- Dependencies change through `pnpm add/remove/update` only - never hand-edit
  `package.json`.
- DB schema changes go through `db/app-schema.ts` + `pnpm db:generate` - never
  hand-write migration SQL into `drizzle/`.
- Worktree creation/management goes through the `wt` command (worktrunk) only -
  `wt switch --create <branch>` to make one, `wt list`, `wt remove` - never raw
  `git worktree`. On create, the `[post-start]` hook in `.config/wt.toml` runs
  `wt step copy-ignored --require-include`, copying the gitignored files listed
  in `.worktreeinclude` (`.env`, `node_modules/`, `.pnpm-store/`, build caches)
  from the main checkout so the new worktree boots warm - no cold reinstall, no
  auth 500 on the default secret. Add a pattern to `.worktreeinclude` when a new
  gitignored artifact is worth copying; both files are committed.
- Every user-facing string gets i18n keys in **all five locales**
  (`i18n/locales/{en,fr,th,tlh,ar}.json`) - tlh is Klingon, keep it terse and
  in-character.
- The gate before any merge: `pnpm typecheck`, `pnpm test:coverage` (98%
  thresholds, enforced), `pnpm test:components`, `pnpm build`. The SSR/rollup
  build catches unresolved-import link errors the others miss (import shared via
  the `#shared` alias, not deep `../../../../shared/*`, from nested route pages).
  Beware zsh pipelines masking
  exit codes (`typecheck | tail` reports success) - `set -o pipefail` or check
  steps separately. The 98% gate covers `server/utils`, `shared`, `app/utils`
  (not `server/api` routes or pages) - that's why logic lives in services: keep
  routes/pages thin enough to not need direct coverage.
- Every user-facing feature ships with an end-to-end test alongside its unit +
  component tests: a Playwright spec in `tests/e2e/*.e2e.ts` covering the feature's
  main path through the real UI, green via `mise run e2e` (the isolated, disposable
  stack - its own DB, never the dev DB). E2E is separate from the coverage gate and
  the SSR build; feature-treatment does not pass without the feature's e2e spec.
- A finished feature branch goes through feature-treatment (rebase -> max-effort
  parallel review -> fix -> gate -> merge -> release -> remove the worktree).
  Nothing merges without that adversarial review and a green gate.
- async/await + try/catch, not `.then/.catch`. Comments explain WHY only, and
  rarely - never narrate code or talk to the reviewer.
- Commit frequently and focused (conventional commits); each slice should be
  revertable on its own.
- Never use em-dashes (the `—` character) anywhere: prose, comments, commit
  messages, changelog, roadmap copy. Use a spaced hyphen ` - `, a colon, or two
  sentences.
- Never assume the deployed/prod version or state - the user runs the deploy and
  you have no server access. Check `https://goal.arzaroth.com/about` for the live
  version, or ask. Don't claim "prod is behind".
- The `brain/` knowledge base must stay true to the code. A change that makes a
  brain doc wrong fixes that doc in the same commit/PR; an inconsistency you spot
  gets fixed with the code as source of truth. See "The brain" below and start
  from `brain/BRAIN.md`.

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
  order-dependent flakes. E2E: Playwright specs in `tests/e2e/*.e2e.ts` drive the
  real app over the isolated stack (`mise run e2e`; seed via
  `tests/e2e/helpers/db.ts`, sign in via `helpers/auth.ts`), not part of the
  coverage gate. An SSR-rendered control can be clicked before hydration wires its
  handler, so gate the first interaction on interactivity (retry with Playwright
  `expect(...).toPass()`), not just visibility.
- Local stack: `mise run dev` (HMR) / `mise run preview` (prod-target build,
  what you use to demo a branch). Worktree previews need `.env` copied from
  the main checkout or auth 500s on the default secret.
- Docker hygiene: `mise run docker-clean` reclaims this project's dangling
  images + orphan build-artifact volumes (`--renew-anon-volumes` leftovers),
  scoped by the compose project label and never touching pgdata. Leave the
  build cache alone - it's a daemon-wide, content-addressed, cross-worktree
  asset (shared pnpm-store mount + deps layers; identical lockfile across
  worktrees = full cache hit). `docker builder prune` wipes it for every
  worktree at once - only run it by hand, knowing it's global.
- mise tasks must run on a prod host with only the built app (no `node_modules`):
  talk to Postgres via `docker compose exec -T db psql`, not the `pg` module.
  Never build SQL by string concat in a task - pass values as psql `-v` vars and
  interpolate with `:'var'` (psql quotes/escapes), and run via `execFileSync`
  (no shell) so there's no shell-quoting injection either.

## Releases

- Cut releases with `mise run release <x.y.z>`: it moves CHANGELOG `[Unreleased]`
  into a dated section, bumps `package.json`, runs the full gate, tags, and
  pushes.
- Keep `CHANGELOG.md` `[Unreleased]` populated as you work (Keep a Changelog:
  Added / Changed / Fixed, user-facing wording). The release fails on an empty
  one.
- Bump **minor** for a user-facing feature, **patch** for fix-only.
- Bump **major** only when a release breaks the deploy/run contract (a
  destructive/irreversible migration, a new required service/env var, an
  auth-provider or DB-engine swap, single- to multi-instance) or shifts the
  product's identity (multi-sport pivot, a scoring overhaul that resets points).
  A library/framework swap alone is not major if how you build, run and deploy
  it is unchanged.
- Pre-release: stop `app-dev` and the working tree must be clean. The release
  only writes the tag and pushes - the user owns the actual prod deploy (and the
  prod roadmap update).

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
- Both files live on `master`; update them there even when feature work happens
  in a worktree branch.
- Surprise/secret features stay out of every user-facing public doc (changelog,
  ROADMAP.md, roadmap-seed, about page) so the surprise survives. They MAY be
  documented in the `brain/` (it's internal dev documentation) and tracked in
  session memory - e.g. the easter eggs live in `brain/features/easter-eggs.md`.

## The brain (knowledge base)

`brain/` is the committed knowledge base describing how the app works:
architecture, features, decisions, glossary. It exists so a developer or AI can
understand the app **without reading the source**. `brain/BRAIN.md` is the entry
index - it links to the `architecture/` and `features/` sub-indexes, which link
to leaf docs. Read it before hunting for where something lives, and navigate via
the indexes rather than grepping the whole tree.

- It is load-bearing: keep it TRUE to the code. When a change makes a brain doc
  wrong, fix the doc in the same commit/PR (same discipline as the planning docs).
- The code is the source of truth. If the brain disagrees with reality, reality
  wins: correct the brain.
- New feature -> add `brain/features/<name>.md`, plus a row in
  `brain/features/index.md` and the catalog table in `brain/BRAIN.md`. New
  cross-cutting tech or subsystem -> add or update a `brain/architecture/*.md`.
- Capture the WHY in `brain/decisions.md` and new terms in `brain/glossary.md` as
  they happen - decisions not written down are lost.
- Don't restate code: link to source paths and cross-link sibling docs with
  relative markdown links. Match the existing dense, skimmable style, no
  em-dashes.
