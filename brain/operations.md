# Operations

How the app is built, run locally, tested, released, and deployed. Task runner is
**mise** (`.mise.toml` + `mise-tasks/`); orchestration is **Docker Compose**.

## Local stack (mise tasks)

| Task | What it does |
|---|---|
| `mise run dev` | HMR dev server + db + maildev (source bind-mounted, hot reload) |
| `mise run preview` | Built (prod-target) app + db + maildev, no HMR - what you demo a branch with |
| `mise run up` | Prod-like: built app + db, no mail catcher (image tagged `:local`) |
| `mise run deploy` | Prod deploy: builds + tags the app image with the `apps/web-nuxt/package.json` version (`nostragoalus-app:<x.y.z>`), then ups the prod stack. `NG_RUNTIME=bun mise run deploy` runs it under Bun (`:<x.y.z>-bun`) instead of Node |
| `mise run down` | Stop everything (incl. dev overlay) |
| `mise run logs` / `logs-dev` | Follow built-app / HMR logs |
| `mise run psql` | psql into the db container |
| `mise run check` | The full gate: typecheck + test:coverage + components + build |
| `mise run test` | `pnpm test:coverage` (the 98% gate alone) |
| `mise run seed-demo` | Fill the DB with demo players/predictions, then re-score |
| `mise run shots` | Retake landing screenshots (headless Firefox) |
| `mise run e2e-smtp` | Email-OTP flow end-to-end through the stack + maildev |
| `mise run e2e` | Browser e2e (Playwright): predict/finalize/leaderboard + mail + SSO against the isolated `ng-e2e` stack (`e2e-up` / `e2e-down` manage its own DB/maildev/keycloak); see `apps/web-nuxt/tests/e2e/README.md` |
| `mise run e2e-bun` | Same Playwright suite, but the app runs under the **Bun** runtime (`prod-bun` target, `compose.e2e-bun.yaml`) - so CI can cover Bun; Node e2e is unchanged |

Worktree previews need `apps/web-nuxt/.env` copied from the main checkout, or auth 500s on the
default secret.

## Docker

Compose project `nostragoalus`: base `apps/web-nuxt/compose.yaml` + dev overlay
`apps/web-nuxt/compose.dev.yaml`. `apps/web-nuxt/Dockerfile` stages: `base` -> `deps` (pnpm fetch, cached) ->
`install` -> `dev` | `build` | `prod` | `prod-bun`. Every stage runs on
`node:22-slim`; the `prod` stage runs as the image's built-in non-root `node` user
(uid 1000), with a node-`fetch` healthcheck since slim ships no wget/curl. The
glibc base runs cycletls' glibc-linked Go helper native, replacing the old Alpine
`gcompat`/`libstdc++` shim. Distroless was tried for prod and rejected: cycletls
spawns its Go helper via `/bin/sh -c`, which distroless lacks (see
[architecture/providers.md](architecture/providers.md)).

**Switchable runtime (Node or Bun).** `prod-bun` (`oven/bun:1-slim`, non-root
`bun` user, glibc + `/bin/sh`) runs under Bun. It needs its OWN build: Nitro's
`bun` preset (`build-bun` stage, `NITRO_PRESET=bun`), NOT the node-server output -
crossws' node WebSocket-upgrade path silently fails under Bun (every `/_ws`
consumer - chat, voice, live board - dies), while the bun preset uses Bun's native
`Bun.serve` WebSocket adapter. The preset is env-driven in `nuxt.config.ts`
(`process.env.NITRO_PRESET ?? 'node-server'`). Node `prod` is the default and the
tested-by-default path; Bun is opt-in. Switch the prod stack with
`NG_APP_TARGET=prod-bun` (the compose `app` build target, tag suffixed via
`NG_APP_TAG_SUFFIX`), or `NG_RUNTIME=bun mise run deploy`. CI covers the Bun
runtime: `mise run e2e-bun` runs the full Playwright suite (incl. the WebSocket
specs) against the `prod-bun` build (`compose.e2e-bun.yaml`, service `app-bun` on
the isolated ng-e2e stack), leaving the Node `mise run e2e` untouched. Bun is
otherwise viable here: its `child_process` honors `{shell:true}` so cycletls'
`/bin/sh` spawn works, and @resvg/resvg-js (OG images) is Bun-napi-compatible.

| Service | Image | Role |
|---|---|---|
| `db` | postgres:17.10-alpine | Postgres (volume `nostragoalus_pgdata`) |
| `rustfs` | rustfs/rustfs | S3-compatible object storage (volume `nostragoalus_media`) |
| `rustfs-init` | minio/mc | one-shot bucket init (idempotent) |
| `mc` | minio/mc | backup/restore client (profile `tools`) |
| `app` | nostragoalus-app:${NG_APP_VERSION:-local} | built prod-target app; `mise run deploy` sets `NG_APP_VERSION` to the package.json version, otherwise `:local` |
| `app-dev` | (same build) | HMR dev server (profile `dev`) |
| `maildev` | - | dev email catcher |

Hygiene: `mise run docker-clean` reclaims this project's dangling images + orphan
build-artifact volumes (scoped by the compose label, never touching pgdata).
Leave the daemon-wide build cache alone - `docker builder prune` wipes it for
every worktree at once.

## The gate

Run before any merge (or `mise run check`):

```
pnpm typecheck && pnpm test:coverage && pnpm test:components && pnpm build
```

The build is last on purpose: the SSR/rollup pass catches unresolved-import link
errors the others miss. Beware zsh pipelines masking exit codes. See
[architecture/testing.md](architecture/testing.md).

## Releases

`mise run release <x.y.z>` (optionally `--dry-run`):

1. Validate semver + clean working tree + tag does not already exist.
2. Move CHANGELOG `[Unreleased]` into a dated `[x.y.z] - YYYY-MM-DD` section
   (`mise run changelog promote`, which moves the same block in every
   `i18n/changelogs/*.md` too); abort if the canonical `[Unreleased]` is empty.
   Parity is checked twice with `mise run changelog check`: once on the clean
   tree before promote (so a divergence aborts without half-mutating the files),
   and again in the gate after promote, so a release can't tag a version whose
   translations are out of step. See [architecture/i18n.md](architecture/i18n.md).
3. Bump `package.json`.
4. Run the full gate with `CI=true`.
5. Commit `chore(release): x.y.z`, annotated tag `vx.y.z`, push
   `master --follow-tags`.

Version bump policy: **minor** for a user-facing feature, **patch** for fix-only,
**major** only when a release breaks the deploy/run contract (new required
service/env var, destructive migration, auth/DB swap) or shifts the product
identity. The owner runs the actual prod deploy and roadmap update; the release
task only writes the tag and pushes. Current version: **2.16.2**.

The full pre-release docs sweep (README, CHANGELOG, API response schemas,
about-page tech stack) is encoded in the `release` skill.

## Backups

- `mise run db-backup` - dumps Postgres and mirrors the media bucket (mc) into
  `backups/`, paired by stamp (`--keep`, `--max-age-days`). Caveat: only the
  s3/rustfs media path is mirrored - an `fs`-driver deploy must back up
  `FS_ROOT` itself.
- `mise run db-restore` - reverses it (`--no-media` to skip images).

## Admin / data tasks

- `mise run create-admin` - create an admin user (CLI).
- `mise run create-api-key` - mint a scoped API key. See [auth.md](architecture/auth.md).
- `mise run roadmap-seed` / `roadmap-add` - seed/add public roadmap items
  (idempotent). Seed new features as IN_PROGRESS here when starting them.
- `mise run roadmap-pull` - list community-suggested roadmap items ranked by
  upvotes (triage the SUGGESTED column onto the roadmap; `--all` includes
  rejected).
- `media:migrate-blobs` (admin Background-tasks page) - move image blobs out of
  Postgres. See [features/image-storage.md](features/image-storage.md).

## Environment variables (the important ones)

- `DATABASE_URL` / `NUXT_DATABASE_URL` - Postgres.
- `RUN_MIGRATIONS=true` - run migrations on boot.
- `NUXT_ADMIN_EMAILS` - comma-separated admin emails.
- `NUXT_SSO_KEK` - 32-byte base64 KEK for SSO secret encryption (required to
  register providers).
- `NUXT_SSO_TRUSTED_ORIGINS` - comma-separated extra trusted origins for an
  internal or private-address SSO IdP (the SSO SSRF guard refuses a private-network
  token endpoint otherwise; public IdPs need nothing). See
  [architecture/auth.md](architecture/auth.md).
- `NUXT_PUBLIC_VAPID_PUBLIC_KEY` / `NUXT_VAPID_PRIVATE_KEY` / `NUXT_VAPID_SUBJECT`
  - web push (prod must generate its own).
- `NUXT_STORAGE_DRIVER` (`fs`|`s3`) + `NUXT_STORAGE_FS_ROOT` / `NUXT_STORAGE_S3_*`
  - image storage.

## Planning docs (kept current as work happens)

- `CHANGELOG.md` - Keep a Changelog; `[Unreleased]` stays populated as you work.
  Translated mirrors live in `i18n/changelogs/{fr,th,tlh,ar}.md` - a new entry goes
  in all of them (the changelog check enforces it).
- `ROADMAP.md` - feature backlog + design decisions (decisions not written down
  are lost). Tick items when they ship with the release version.
- `TODO.md` - tech debt + deferred work; tick what a change resolves, add what it
  defers.

## Deploy ownership

The owner runs the deploy and has no shared server access for the assistant.
Never assume the deployed/prod version or state: check
`https://goal.arzaroth.com/about` for the live version, or ask.

## Sources

- `.mise.toml`, `mise-tasks/*`
- `apps/web-nuxt/compose.yaml`, `apps/web-nuxt/compose.dev.yaml`, `apps/web-nuxt/Dockerfile`
- `CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `package.json`
