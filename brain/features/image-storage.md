# Image storage

Image blobs (avatars, league [prize](rewards.md) and league-description images,
and encrypted chat / DM attachments) live in a pluggable object store, not in
Postgres. This page is the feature / ops view; the driver internals are in
[../architecture/storage.md](../architecture/storage.md).

## What it is

A `StorageDriver` abstraction with two backends - `fs` (node:fs) and `s3` - so
the same code path serves a single-host filesystem deploy or an S3-compatible
object store. Avatars (`avatar/<sha256>.<ext>`) and reward / description images
(`reward/<sha256>.<ext>`, written by `storeRewardFromDataUrl`) are
content-addressed; chat ciphertext (`chat/{messageId}/{idx}`) stays
server-opaque. Key builders live in `apps/web-nuxt/server/utils/storage/keys.ts`. Every new write goes to the store;
only legacy rows still hold an in-DB blob until they are migrated.

Shipped in **v2.0.0**, a MAJOR release because it changed the deploy contract:

- a new required stateful service plus credentials,
- a changed backup contract (DB + media together),
- a column-nulling migration that empties the legacy in-DB ciphertext.

## Production deploy

The docker deploy defaults to the `s3` driver with **rustfs** in compose (the app
points at `rustfs:9000`); the app's own runtime default, outside compose, is `fs`.
Bucket init is one-shot via `quay.io/minio/mc` (the `rustfs-init` service; Docker
Hub's `minio/mc` repository is gone). Configuration is `NUXT_STORAGE_DRIVER` /
`_FS_ROOT` / `_S3_*`.

## Migration

`media:migrate-blobs` is a Nitro task (manual, fire-and-forget) that moves
existing in-DB blobs into the store. It is idempotent and resumable (the work
queue is the predicate), run from the admin Background-tasks page until both
counts reach 0. Run it to zero BEFORE the release that drops the legacy
ciphertext column and makes `storage_key` NOT NULL.

Note: a Nitro file-based task registers by its path, so the file must be named
`apps/web-nuxt/server/tasks/media/migrate-blobs.ts` to be callable as `media:migrate-blobs`
(an earlier `migrate.ts` registered as `media:migrate` and silently no-op'd).

## Backup

`mise run db-backup` dumps the database and mirrors the bucket (`mc mirror`),
paired by a stamp; `mise run db-restore` reverses it (`--no-media` to skip).
Caveat: the combined backup only mirrors the s3 / rustfs path - an `fs`-driver
deploy must back up `FS_ROOT` itself.

## Ops the owner still owns

Run `media:migrate-blobs` until counts are 0, set real `NUXT_STORAGE_S3`
credentials, and ensure the rustfs media volume is backed up. Deferred follow-ups
(orphan-object GC, takedown deletes, CDN for avatars, multi-node backup) are
tracked in TODO.

## Sources

- `apps/web-nuxt/server/utils/storage/*` (driver, drivers/fs, drivers/s3, factory, keys, service, index)
- Writers: `apps/web-nuxt/server/utils/auth/avatar.ts`, `apps/web-nuxt/server/utils/rewards/image.ts`,
  `apps/web-nuxt/server/utils/chat/service.ts`, `apps/web-nuxt/server/utils/dm/service.ts`
- `apps/web-nuxt/server/tasks/media/migrate-blobs.ts`, `apps/web-nuxt/server/utils/storage/migrate.ts`
- `mise-tasks/db-backup`, `mise-tasks/db-restore`, `apps/web-nuxt/compose.yaml`
- Driver internals: [../architecture/storage.md](../architecture/storage.md)
