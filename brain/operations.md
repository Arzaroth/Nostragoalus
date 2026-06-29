# Operations

How the app is built, run locally, tested, released, and deployed. Task runner is
**mise** (`.mise.toml` + `mise-tasks/`); orchestration is **Docker Compose**.

## Local stack (mise tasks)

| Task | What it does |
|---|---|
| `mise run dev` | HMR dev server + db + maildev (source bind-mounted, hot reload) |
| `mise run preview` | Built (prod-target) app + db + maildev, no HMR - what you demo a branch with |
| `mise run up` | Prod-like: built app + db, no mail catcher |
| `mise run down` | Stop everything (incl. dev overlay) |
| `mise run logs` / `logs-dev` | Follow built-app / HMR logs |
| `mise run psql` | psql into the db container |
| `mise run check` | The full gate: typecheck + test:coverage + components + build |
| `mise run test` | `pnpm test:coverage` (the 98% gate alone) |
| `mise run seed-demo` | Fill the DB with demo players/predictions, then re-score |
| `mise run shots` | Retake landing screenshots (headless Firefox) |
| `mise run e2e-smtp` | Email-OTP flow end-to-end through the stack + maildev |

Worktree previews need `.env` copied from the main checkout, or auth 500s on the
default secret.

## Docker

Compose project `nostragoalus`: base `compose.yaml` + dev overlay
`compose.dev.yaml`. `Dockerfile` stages: `base` -> `deps` (pnpm fetch, cached) ->
`install` -> `dev` | `build` | `prod`. The cycletls glibc shim (`gcompat`,
`libstdc++`) is installed in the **base** stage so it is inherited by dev, build,
and prod (a provider HTTP engine fails on Alpine/musl without it). See
[architecture/providers.md](architecture/providers.md).

| Service | Image | Role |
|---|---|---|
| `db` | postgres:17.10-alpine | Postgres (volume `nostragoalus_pgdata`) |
| `rustfs` | rustfs/rustfs | S3-compatible object storage (volume `nostragoalus_media`) |
| `rustfs-init` | minio/mc | one-shot bucket init (idempotent) |
| `mc` | minio/mc | backup/restore client (profile `tools`) |
| `app` | nostragoalus-app:local | built prod-target app |
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
task only writes the tag and pushes. Current version: **2.1.0**.

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
- `media:migrate-blobs` (admin Background-tasks page) - move image blobs out of
  Postgres. See [features/image-storage.md](features/image-storage.md).

## Environment variables (the important ones)

- `DATABASE_URL` / `NUXT_DATABASE_URL` - Postgres.
- `RUN_MIGRATIONS=true` - run migrations on boot.
- `NUXT_ADMIN_EMAILS` - comma-separated admin emails.
- `NUXT_SSO_KEK` - 32-byte base64 KEK for SSO secret encryption (required to
  register providers).
- `NUXT_PUBLIC_VAPID_PUBLIC_KEY` / `NUXT_VAPID_PRIVATE_KEY` / `NUXT_VAPID_SUBJECT`
  - web push (prod must generate its own).
- `NUXT_STORAGE_DRIVER` (`fs`|`s3`) + `NUXT_STORAGE_FS_ROOT` / `NUXT_STORAGE_S3_*`
  - image storage.

## Planning docs (kept current as work happens)

- `CHANGELOG.md` - Keep a Changelog; `[Unreleased]` stays populated as you work.
  Translated mirrors live in `i18n/changelogs/{fr,th,tlh}.md` - a new entry goes
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
- `compose.yaml`, `compose.dev.yaml`, `Dockerfile`
- `CHANGELOG.md`, `ROADMAP.md`, `TODO.md`, `package.json`
