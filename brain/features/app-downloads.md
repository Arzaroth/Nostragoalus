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
- `GET /download/nostragoalus-<version>.apk` - the file itself
  ([server/routes/download/[apk].get.ts](../../apps/web-nuxt/server/routes/download/%5Bapk%5D.get.ts)),
  streamed with the Android package content type, a version-stamped
  `content-disposition` filename and the digest as the ETag. No user input reaches
  the filesystem: the served path is always the one fixed file, the requested name
  only selects an answer, and the version is stripped to `[A-Za-z0-9._-]` before it
  goes anywhere near a header or a URL.
- `GET /download/nostragoalus.apk` - the stable alias, which every install up to
  4.9.0 has compiled in. It 302s to the versioned URL, so it keeps answering
  without being the thing that serves ~90 MB.

## Why the URL carries the version

The APK was served `no-cache` under one fixed name, so every download streamed the
whole file out of the Node process and the CDN in front absorbed none of it. A
response can only be cached if its bytes never change, so the bytes get a URL of
their own: a new build is a new URL rather than new bytes behind the old one, and
the versioned response is `public, max-age=31536000, immutable`. `androidDownloadUrl`
is the one place that decides it, and `/api/app/android` hands it out so the page
and a current app never take the redirect.

An **unversioned** build - a hand-copied APK with no sidecar - has no versioned URL
to point at, so the alias serves it directly and uncached. That is also why the
alias cannot simply always redirect: it would redirect to itself.

A cache in front is not by itself a shield, which is the part worth remembering.
Cloudflare's cache key includes the query string, so `?x=1`, `?x=2`, ... are all
misses and each miss drags the full file off the origin, with no rate limit behind
it. A query string has no legitimate use on this URL, so it is answered with a
redirect to the canonical one: such a request costs a few hundred bytes instead of
~90 MB. That is a mitigation and not the fix - the fix is a cache rule that ignores
the query string, or moving the object off the origin entirely, both of which are
open in [TODO.md](../../TODO.md).

`If-None-Match` is honoured, so a client revalidating the alias (which is
`no-cache`, meaning revalidate, not do-not-store) gets a 304 rather than the file
again.

`app/components/AndroidAppCard.vue` renders the section. It reads the endpoint per
request rather than at build time, because whether a build exists is deploy state;
a failed read renders the "nothing published" branch instead of breaking the page.
The publish date renders as its ISO day so the server and the browser agree.

## Sources

- [apps/web-nuxt/server/utils/app-download/service.ts](../../apps/web-nuxt/server/utils/app-download/service.ts)
- [apps/web-nuxt/server/utils/app-download/index.ts](../../apps/web-nuxt/server/utils/app-download/index.ts)
- [apps/web-nuxt/server/api/app/android.get.ts](../../apps/web-nuxt/server/api/app/android.get.ts)
- [apps/web-nuxt/server/utils/app-download/serve.ts](../../apps/web-nuxt/server/utils/app-download/serve.ts)
- [apps/web-nuxt/server/routes/download/[apk].get.ts](../../apps/web-nuxt/server/routes/download/%5Bapk%5D.get.ts)
- [apps/web-nuxt/app/components/AndroidAppCard.vue](../../apps/web-nuxt/app/components/AndroidAppCard.vue)
- [apps/web-nuxt/tests/e2e/android-download.e2e.ts](../../apps/web-nuxt/tests/e2e/android-download.e2e.ts)
