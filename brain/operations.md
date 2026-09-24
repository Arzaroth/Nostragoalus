# Operations

How the app is built, run locally, tested, released, and deployed. Task runner is
**mise**, in three layers: the root `.mise.toml` (the compose stacks, with
`COMPOSE_FILE=apps/web-nuxt/compose.yaml` in its `[env]`) + `mise-tasks/` (release,
backups, admin/roadmap scripts); `apps/web-nuxt/.mise.toml` (the web gate and
scripts, pinned to that dir via `config_root`); `apps/mobile-flutter/.mise.toml`
(the Flutter toolchain and gate). Orchestration is **Docker Compose**.

## Local stack (mise tasks)

| Task | What it does |
|---|---|
| `mise run dev` | HMR dev server + db + maildev (source bind-mounted, hot reload) |
| `mise run preview` | Built (prod-target) app + db + maildev, no HMR - what you demo a branch with |
| `mise run up` | Prod-like: built app + db + rustfs + coturn (`--profile voice`), no mail catcher (image tagged `:local`) |
| `mise run deploy` | Prod deploy: builds + tags the app image with the `apps/web-nuxt/package.json` version (`nostragoalus-app:<x.y.z>`), then ups the prod stack (incl. coturn). `NG_RUNTIME=bun mise run deploy` runs it under Bun (`:<x.y.z>-bun`) instead of Node |
| `mise run down` | Stop everything (incl. dev overlay) |
| `mise run logs` / `logs-dev` | Follow built-app / HMR logs |
| `mise run psql` | psql into the db container |
| `mise run e2e` | Browser e2e (Playwright): predict/finalize/leaderboard + mail + SSO against the isolated `ng-e2e-<worktree>` stack (`e2e-up` / `e2e-down` bring up and drop its own DB/maildev/keycloak); see `apps/web-nuxt/tests/e2e/README.md` |
| `mise run e2e-bun` | Same Playwright suite, but the app runs under the **Bun** runtime (`prod-bun` target, `compose.e2e-bun.yaml`, stack via `e2e-up-bun`) - so CI can cover Bun; Node e2e is unchanged |

Web-app tasks (`apps/web-nuxt/.mise.toml`, run in that dir whatever the cwd):

| Task | What it does |
|---|---|
| `mise run check` | The full gate: typecheck + test:coverage + test:components + build |
| `mise run test` / `components` | `pnpm test:coverage` (the 98% gate alone) / `pnpm test:components` |
| `mise run build-integrity` | Fingerprint the built client bundle (also runs as `postbuild`); see [architecture/build-integrity.md](architecture/build-integrity.md) |
| `mise run seed-demo` | Fill the DB with demo players/predictions, then re-score (stack up) |
| `mise run shots` | Retake landing screenshots (headless Firefox) |
| `mise run e2e-smtp` | Email-OTP flow end-to-end through the stack + maildev |

Mobile tasks (`apps/mobile-flutter/.mise.toml`): `gate` (stale-checks + analyze +
tests + parity + debug APK), `parity`, `gen-models`, `i18n-sync`, `integration`,
`e2e-seed` / `e2e` (against the root `e2e-up` stack), `apk-publish` (release APK to
R2 + the sidecar). See [features/mobile-app.md](features/mobile-app.md) and
[features/app-downloads.md](features/app-downloads.md).

Worktree previews need `apps/web-nuxt/.env` copied from the main checkout, or auth 500s on the
default secret.

## Docker

Compose project `nostragoalus`: base `apps/web-nuxt/compose.yaml` + dev overlay
`apps/web-nuxt/compose.dev.yaml`. `apps/web-nuxt/Dockerfile` stages: `base` -> `deps` (pnpm fetch, cached) ->
`install` -> `dev` | `build` | `prod` | `build-bun` -> `prod-bun`. The node stages
(`dev`, `build`, `prod`) run on `node:22-slim`; the `prod` stage runs as the
image's built-in non-root `node` user (uid 1000), with a node-`fetch` healthcheck
since slim ships no wget/curl. (`build-bun`/`prod-bun` are the Bun runtime - see
the switchable-runtime note below.) The
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
(`process.env.NITRO_PRESET ?? 'node-server'`). The `prod-bun` stage also sets
`HOST=::`: the bun preset otherwise binds loopback-only (unlike node-server's
`[::]`), which is unreachable via Docker's DNAT path and shows up as intermittent
ECONNREFUSED under load. Node `prod` is the default and the
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
| `rustfs-init` | quay.io/minio/mc | one-shot bucket init (idempotent) |
| `mc` | quay.io/minio/mc | backup/restore client (profile `tools`) |
| `coturn` | coturn/coturn:4.6.2-alpine | TURN relay for voice (profile `voice`); see [architecture/webrtc.md](architecture/webrtc.md) |
| `app` | nostragoalus-app:${NG_APP_VERSION:-local}${NG_APP_TAG_SUFFIX:-} | built app, target `${NG_APP_TARGET:-prod}`, `mem_limit: 2g`; `mise run deploy` sets `NG_APP_VERSION` to the package.json version, otherwise `:local` |
| `app-dev` | nostragoalus-app:dev (`dev` target) | HMR dev server (dev overlay, profile `dev`) |
| `maildev` | maildev/maildev:2.2.1 | dev email catcher (dev overlay) |
| `keycloak` | quay.io/keycloak/keycloak:26.0 | SSO IdP for the e2e suite (dev overlay, profile `e2e`) |
| `app-bun` | nostragoalus-app:e2e-bun (`prod-bun` target) | the Bun app for `e2e-bun` (`compose.e2e-bun.yaml`, profile `e2e-bun`) |

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
3. Bump `apps/web-nuxt/package.json` (jq; the root `package.json` is the workspace
   shell and carries no version).
4. Run the full gate with `CI=true` (`pnpm -C apps/web-nuxt ...`).
5. Commit `chore(release): x.y.z`, annotated tag `vx.y.z`, push
   `master --follow-tags`.

Version bump policy: **minor** for a user-facing feature, **patch** for fix-only,
**major** only when a release breaks the deploy/run contract (new required
service/env var, destructive migration, auth/DB swap) or shifts the product
identity. The owner runs the actual prod deploy and roadmap update; the release
task only writes the tag and pushes. The current version is `version` in
`apps/web-nuxt/package.json`; the Android app versions separately (see
[features/mobile-app.md](features/mobile-app.md)).

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

Reference list with comments: `apps/web-nuxt/.env.example`; typed defaults in
`runtimeConfig` (`apps/web-nuxt/nuxt.config.ts`).

- `DATABASE_URL` / `NUXT_DATABASE_URL` - Postgres.
- `RUN_MIGRATIONS=true` - run migrations on boot (`server/plugins/migrate.ts`).
- `NUXT_BETTER_AUTH_SECRET` / `BETTER_AUTH_SECRET` - auth signing secret (the
  default one is why a worktree without `.env` 500s on auth);
  `NUXT_PUBLIC_AUTH_URL` / `BETTER_AUTH_URL` - the public base URL.
- `NUXT_ADMIN_EMAILS` - comma-separated admin emails.
- `NUXT_SMTP_URL` / `NUXT_SMTP_FROM` - mail transport; unset = no mail, and email
  verification cannot be switched on.
- `NUXT_SSO_KEK` - 32-byte base64 KEK for SSO secret encryption (required to
  register providers).
- `NUXT_SSO_TRUSTED_ORIGINS` - comma-separated extra trusted origins for an
  internal or private-address SSO IdP (the SSO SSRF guard refuses a private-network
  token endpoint otherwise; public IdPs need nothing). See
  [architecture/auth.md](architecture/auth.md).
- `NUXT_PUBLIC_VAPID_PUBLIC_KEY` / `NUXT_VAPID_PRIVATE_KEY` / `NUXT_VAPID_SUBJECT`
  - web push (prod must generate its own).
- `NUXT_TURN_SECRET` / `NUXT_TURN_HOST` / `NUXT_TURN_REALM` (+ `NUXT_TURN_PORT`,
  `NUXT_TURN_TLS_PORT`, `NUXT_TURN_MIN_PORT`/`MAX_PORT`, `NUXT_TURN_EXTERNAL_IP` for
  coturn) - voice TURN relay; unset = STUN-only.
- `NUXT_STORAGE_DRIVER` (`fs`|`s3`) + `NUXT_STORAGE_FS_ROOT` / `NUXT_STORAGE_S3_*`
  - image storage.
- `NUXT_CRON_ENABLED` (default `true`) - gates the scheduled Nitro tasks (score
  polling, pruning, ...) under `server/tasks/`.
- `NUXT_APP_DOWNLOAD_DIR` - where the APK sidecar is read (default
  `/data/downloads` in prod); `NUXT_MIN_ANDROID_CLIENT` - override of the Android
  version floor, for undoing a too-high floor with a restart.
- Compose-level (not app config): `NG_APP_VERSION`, `NG_APP_TARGET`,
  `NG_APP_TAG_SUFFIX` (image tag + build target, see above), `NG_APP_PORT` (host
  port), `NG_RUNTIME=bun` (for `mise run deploy`).

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

- `.mise.toml`, `mise-tasks/*`, `apps/web-nuxt/.mise.toml`, `apps/mobile-flutter/.mise.toml`
- `apps/web-nuxt/compose*.yaml`, `apps/web-nuxt/Dockerfile`, `apps/web-nuxt/.env.example`
- `CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `apps/web-nuxt/package.json`
