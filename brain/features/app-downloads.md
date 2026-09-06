# App downloads

The site hands out the Android build of the [mobile app](mobile-app.md). There is
no app store listing, so `/about` carries an Android section with a download
button and the numbers needed to check the file: the version, its size, the day it
was published and its SHA-256. Every public page links to that section from the
footer. When no build is published the section says so and offers the source
instead, and the download itself 404s.

## Where the APK lives

The APK is a deploy artifact, not part of the web image. The web build has no
Flutter toolchain, so baking it in would couple every site release to an app
build. Instead the app reads it off disk at request time:

- `mise run apk-publish` (in [apps/mobile-flutter/.mise.toml](../../apps/mobile-flutter/.mise.toml))
  builds the release APK and copies it to `apps/web-nuxt/downloads/nostragoalus.apk`,
  writing a `nostragoalus.apk.json` sidecar beside it with the release version and
  the build time. The version stamped in is the web app's `package.json` version,
  so the APK on `/about` reads as the same release as the site serving it.
- `compose.yaml` bind-mounts that directory read-only at `/data/downloads`, which
  is the production default. A bare local run reads `./.data/downloads`.
  `NUXT_APP_DOWNLOAD_DIR` overrides both.
- Publishing a new build is therefore a file copy plus nothing: no image rebuild,
  no redeploy, no restart.

## Serving it

[server/utils/app-download/service.ts](../../apps/web-nuxt/server/utils/app-download/service.ts)
holds the logic: stat the APK, read the optional sidecar, and hash the bytes.
Anything that is not a non-empty regular file reads as "no build published", and a
missing or malformed sidecar only costs the version line - it never takes the
download offline.

Hashing a ~60 MB file on every `/about` visit would be pure waste, so the digest is
cached against the file's path, mtime and size. Replacing the APK changes the key,
so a new build is hashed once and the old entry becomes unreachable.

`server/utils/app-download/index.ts` is the `useRuntimeConfig` glue that resolves
the directory, kept apart from the logic (and out of the coverage gate) the same
way [storage](../architecture/storage.md) separates its entrypoint.

Two routes:

- `GET /api/app/android` - the public contract
  ([server/api/app/android.get.ts](../../apps/web-nuxt/server/api/app/android.get.ts)):
  `available`, `version`, `sizeBytes`, `sha256`, `builtAt`, `downloadUrl`. The page
  never hardcodes the download path, it follows this.
- `GET /download/nostragoalus.apk` - the file itself
  ([server/routes/download/nostragoalus.apk.get.ts](../../apps/web-nuxt/server/routes/download/nostragoalus.apk.get.ts)),
  streamed with the Android package content type, a version-stamped
  `content-disposition` filename and the digest as the ETag. No user input reaches
  the filesystem: the path is fixed, and the version is stripped to
  `[A-Za-z0-9._-]` before it goes anywhere near a header.

`app/components/AndroidAppCard.vue` renders the section. It reads the endpoint per
request rather than at build time, because whether a build exists is deploy state;
a failed read renders the "nothing published" branch instead of breaking the page.
The publish date renders as its ISO day so the server and the browser agree.

## Sources

- [apps/web-nuxt/server/utils/app-download/service.ts](../../apps/web-nuxt/server/utils/app-download/service.ts)
- [apps/web-nuxt/server/utils/app-download/index.ts](../../apps/web-nuxt/server/utils/app-download/index.ts)
- [apps/web-nuxt/server/api/app/android.get.ts](../../apps/web-nuxt/server/api/app/android.get.ts)
- [apps/web-nuxt/server/routes/download/nostragoalus.apk.get.ts](../../apps/web-nuxt/server/routes/download/nostragoalus.apk.get.ts)
- [apps/web-nuxt/app/components/AndroidAppCard.vue](../../apps/web-nuxt/app/components/AndroidAppCard.vue)
- [apps/web-nuxt/tests/e2e/android-download.e2e.ts](../../apps/web-nuxt/tests/e2e/android-download.e2e.ts)
