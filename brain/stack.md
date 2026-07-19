# Stack

The exact technologies and versions Nostragoalus runs on. Bump these when
`package.json` / Docker images change (the maintenance rule covers it).

Sources of truth: `package.json`, `pnpm-workspace.yaml`, `apps/web-nuxt/nuxt.config.ts`,
`apps/web-nuxt/Dockerfile`, `apps/web-nuxt/compose.yaml`.

## Runtime / language

- **Node** >= 22 (Docker: `node:22-slim` for the build stages and the default
  `prod` runtime - real glibc, unlike the old Alpine base; prod runs as the
  non-root `node` user). An opt-in Bun runtime (`prod-bun`, `oven/bun:1-slim`)
  runs the same app - see [operations.md](operations.md).
- **TypeScript** 6.0.3, strict.
- **pnpm** 11.5.1 (workspace config in `pnpm-workspace.yaml`, `minimumReleaseAge: 0`).
  Dependencies change through `pnpm add/remove/update` only - never hand-edit
  `package.json`.

## Framework / frontend

- **Nuxt** 4.4.7 (Vue 3.5.35, vue-router 5.1.0). SSR + Nitro `node-server` preset.
- **Nitro** websocket enabled; OpenAPI docs served at `/_docs/openapi.json`.
- **PrimeVue v4** (`@primevue/nuxt-module`) with `@primeuix/themes`; custom
  `NostraTheme` preset, dark mode via the `.app-dark` selector.
- **UnoCSS** 66.7.0 (utility CSS; dark variant `.app-dark`).
- **@tanstack/vue-query** 5.101.0 - the client data layer (see
  [architecture/client.md](architecture/client.md)). App-level `staleTime: 60_000`,
  `refetchOnWindowFocus: false`.
- **@nuxtjs/i18n** 10.4.0 - five locales `en / fr / th / tlh / ar` (see
  [architecture/i18n.md](architecture/i18n.md)).
- **@vite-pwa/nuxt** - service worker via `injectManifest` (custom SW). See
  [features/pwa.md](features/pwa.md) and [features/web-push.md](features/web-push.md).
- **@vueuse/nuxt** - composition utilities used throughout.
- **leaflet** 1.9.4 - the team world map (`.client.vue`, browser-only).

## Auth

- **better-auth** 1.6.23 with plugins, all in lockstep at 1.6.23 (`scim` +
  `api-key` exact-pinned, the rest `^1.6.23`):
  - `@better-auth/sso` (OIDC + SAML, SAML via `samlify`)
  - `@better-auth/passkey`
  - `@better-auth/api-key`
  - built-in `twoFactor` and `admin` plugins.
- See [architecture/auth.md](architecture/auth.md).

## Data

- **Postgres 17** (Docker `postgres:17.10-alpine`).
- **Drizzle ORM** 0.45.2 (`drizzle-orm/node-postgres`), **drizzle-kit** 0.31.10.
- **pg** 8.21.0 (single `pg.Pool`).
- Schema changes go through `apps/web-nuxt/db/app-schema.ts` + `pnpm db:generate` - never
  hand-write migration SQL. See [architecture/database.md](architecture/database.md).

## Object storage (images)

- Pluggable `StorageDriver`: `fs` (node:fs) or `s3`.
- Production deploy uses **rustfs/rustfs** (S3-compatible) via `aws4fetch` SigV4,
  path-style. `minio/mc` handles bucket-init and backup mirroring.
- See [architecture/storage.md](architecture/storage.md) and
  [features/image-storage.md](features/image-storage.md).

## Server-rendered images / providers

- **satori** 0.26.0 (HTML/CSS -> SVG) + **@resvg/resvg-js** 2.6.2 (SVG -> PNG)
  for OG/share cards. See [features/share-images.md](features/share-images.md).
- **web-push** 3.6.7 - VAPID web push.
- **cycletls** 2.0.5 - uTLS (browser JA3 fingerprint) HTTP engine for providers
  whose WAF (Cloudflare) blocks Node's default TLS: odds + link unfurl. See
  [architecture/providers.md](architecture/providers.md).
- **marked** 18.0.5 (changelog/roadmap markdown), **qrcode** 1.5.4 (2FA).

## Testing

- **vitest** 4.1.8 + **@vitest/coverage-v8** 4.1.8 + **@nuxt/test-utils** 4.0.3.
- **@electric-sql/pglite** - in-memory Postgres running the real migrations for
  service tests. See [architecture/testing.md](architecture/testing.md).

## Ops

- **Docker Compose** project `nostragoalus`: base `apps/web-nuxt/compose.yaml` + dev overlay
  `apps/web-nuxt/compose.dev.yaml`. Services: `db`, `rustfs` (+`rustfs-init`, `mc`), `app`,
  `app-dev`, `maildev`. Volumes `nostragoalus_pgdata`, `nostragoalus_media`.
- **mise** task runner (`.mise.toml` + `mise-tasks/`). See
  [operations.md](operations.md).
