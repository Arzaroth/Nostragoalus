# Storage (image blobs)

Image blobs (user avatars and end-to-end-encrypted chat images) live in a
pluggable object store, not in Postgres. This shipped in **v2.0.0** (a MAJOR
release: it added a required stateful service and changed the backup contract).
The product-level story is in
[../features/image-storage.md](../features/image-storage.md); this file is the
mechanism.

## The driver interface

`apps/web-nuxt/server/utils/storage/driver.ts` defines `StorageDriver`:

```
put(key, bytes, contentType)   get(key)   delete(key)   exists(key)
```

Two implementations, mirroring the providers/odds factory pattern:

- `drivers/fs.ts` - node:fs. Writes go to a temp file then atomic rename;
  every key is checked against a root-escape guard so `..` cannot climb out of
  the configured root.
- `drivers/s3.ts` - `aws4fetch` SigV4, path-style addressing, with an
  injectable `fetchImpl` for tests. Keys pass `assertSafeKey` as a backstop.

`factory.ts` picks the driver; `keys.ts` derives the object keys (and holds
`assertSafeKey`); `service.ts` wraps put/get.
`index.ts` holds the `useRuntimeConfig` glue (`useStorageDriver()` /
`resolveStorage(driver?)`) and is excluded from coverage like the providers
index. Services that may touch images take an optional `driver?` resolved lazily
only when an image is actually involved, so unit tests inject `memoryStorage()`
from `apps/web-nuxt/tests/storage.ts`.

## Config

Environment, read in `apps/web-nuxt/nuxt.config.ts` runtimeConfig:

- `NUXT_STORAGE_DRIVER` = `fs` | `s3` (the Docker deploy defaults to `s3`).
- `NUXT_STORAGE_FS_ROOT` for the fs driver.
- `NUXT_STORAGE_S3_*` (endpoint, bucket, access key, secret) for s3. The compose
  deploy points these at rustfs.

`StorageError` is the one storage failure class; `toHttpError` maps it to a
**generic** 500 (it deliberately does not leak the fs path or S3 key). See
[server.md](server.md).

## Avatars

- Content-addressed: `avatar/{sha256}.{ext}` (immutable, cache-friendly, no
  userId in the key).
- Stored by intercepting two existing paths in `apps/web-nuxt/lib/auth.ts`: the
  `update.before` hook (client uploads a data URL) and `provisionUser` (IdP
  photos on SSO login), both via `storeAvatarFromDataUrl` in
  `apps/web-nuxt/server/utils/auth/avatar.ts`.
- `user.image` holds a serving URL `/api/media/avatar/{key}`; the GET route
  requires a user and serves the bytes with an immutable cache header. There is
  no new upload route: avatars reuse the proven updateUser path.

## Chat images (server-opaque)

- Chat images are E2E-encrypted; the server stores ciphertext and never sees the
  plaintext. Key shape `chat/{messageId}/{idx}`.
- The `chat_attachment` row carries either inline `ciphertext` OR a `storage_key`
  (a CHECK constraint enforces exactly one - see
  [database.md](database.md)). `postMessage` pre-generates the message id and
  writes storage BEFORE the DB transaction; `editMessage` writes added images
  before the tx and deletes removed objects after commit.
  `getAttachmentCiphertext` reads from storage when the column is null, so the
  wire shape to clients is unchanged regardless of backend.

## Migration and backup

- `media:migrate-blobs` (a manual Nitro task, `apps/web-nuxt/server/tasks/media/migrate-blobs.ts`,
  wrapping the `migrateBlobsToStorage` logic in `apps/web-nuxt/server/utils/storage/migrate.ts`)
  copies legacy in-DB blobs into the store. It is idempotent and resumable (the
  remaining-in-DB predicate is its own work queue) and is run from the admin
  Background-tasks page until the counts reach zero, BEFORE the release that
  drops the legacy column.
- `mise run db-backup` dumps Postgres AND mirrors the media bucket with `mc
  mirror`, paired by a timestamp; `db-restore` reverses it. Caveat: only the
  s3/rustfs path is mirrored - an `fs`-driver deploy must back up `FS_ROOT`
  itself. See [../operations.md](../operations.md).

## Sources

- `apps/web-nuxt/server/utils/storage/{driver,factory,service,index,keys,migrate}.ts`
- `apps/web-nuxt/server/utils/storage/drivers/{fs,s3}.ts`
- `apps/web-nuxt/server/tasks/media/migrate-blobs.ts` (the Nitro task wrapper)
- `apps/web-nuxt/server/utils/auth/avatar.ts`, `apps/web-nuxt/server/api/media/avatar/[...key].get.ts`
- `apps/web-nuxt/db/app-schema.ts` (`chat_attachment`), `apps/web-nuxt/tests/storage.ts`
- `apps/web-nuxt/compose.yaml` (rustfs, rustfs-init, mc), `mise-tasks/db-backup`
