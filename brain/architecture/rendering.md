# Rendering (server images + PWA service worker)

Two server-adjacent rendering concerns that bite if you forget their footguns:
server-rendered share/OG images, and the PWA service worker.

## OG / share images

Prediction share cards render server-side: **satori** turns a hand-rolled
HTML/CSS element tree into SVG, then **@resvg/resvg-js** rasterizes SVG to PNG.
The app does NOT use the nuxt-og-image module: the route logic and deps are kept
explicit. Product details in
[../features/share-images.md](../features/share-images.md).

Pipeline lives in `apps/web-nuxt/server/utils/share/*`:

- `token.ts` - stateless HMAC tokens, domain-separated from the auth secret.
  Minting (`/api/share/mint`) checks ownership; the public render trusts the
  signed token.
- the card model + the pure element template + `render.ts` (satori + resvg).
- the binary route `apps/web-nuxt/server/routes/og/share/[token].get.ts` is outside the
  coverage gate; the pure logic under `apps/web-nuxt/server/utils/share/**` is inside it.
- Cache: finished-result cards cache ~1 day, live / pre-kickoff cards ~120s.

### Two footguns (do not relearn these)

1. **satori needs `ttf` / `otf` / `woff`, NOT `woff2`, and does not fetch remote
   images.** Vendored woff fonts live in `apps/web-nuxt/server/assets/fonts/` (Inter Latin plus
   Noto Sans Thai for locale glyph coverage via satori's per-glyph fallback).
   Additional subsets are fetched from Google Fonts on demand through satori's
   `loadAdditionalAsset` and cached, degrading to tofu offline.
   `apps/web-nuxt/server/utils/share/font-fallback.ts` picks which families to
   try for a run and is the tested half; `og-assets.ts` is the I/O half.
   Rules that took a round of debugging, all of them satori behaviour:
   - satori labels a run with a locale (`ar-AR`, `ja-JP|zh-CN|...`), with
     `emoji` / `symbol` / `math`, or with `unknown`. Only the first two forms are
     a lookup; `unknown` covers ~140 scripts, so the family is read off the text
     with `\p{scx=X}` over `NOTO_SCRIPTS` (Noto names families after the Unicode
     script). Latin, Cyrillic and Greek also arrive as `unknown` and are served
     by plain Noto Sans, which is why it always closes the candidate list.
   - satori tests its symbol regex before its math one, so math operators are
     labelled `symbol`; both codes try Symbols 2 and Math.
   - One run can mix scripts, so every detected script is fetched, not the first.
   - Registered fonts are keyed by NAME, so a subset is registered under
     `family#run` - two runs pulling different subsets of one family (Noto Sans
     for a symbol run and a Cyrillic one) otherwise collide and one tofus.
   - Emoji use monochrome Noto Emoji: the card traces glyphs to paths, so a
     color font gains nothing.
   Google can answer 200 with an HTML error page, so a buffer that is not an
   sfnt/woff is dropped rather than handed to satori (which throws on it), both
   fetches carry a timeout, and display names are capped by `shareName`
   (`template.ts`) so one card cannot pull unbounded subsets.
   Team identity uses CODE pills (ENG/SEN) or flags inlined as
   data URIs, never a remote FIFA-CDN `<img>` (that would add a render-time
   network dependency). Assets load at runtime via
   `useStorage('assets:server').getItemRaw(...)`.
2. **Never call `useRequestURL()` (or any composable) inside a `useSeoMeta`
   getter.** unhead walks those getters lazily during SSR head resolution,
   outside the Nuxt instance context, which throws `H3Error: [nuxt] instance
   unavailable` and 500s the page. Resolve `const origin =
   useRequestURL().origin` once in setup and reference the constant in the
   getter. The build stays green; it only blows up at request time, so verify the
   rendered route, not just the build.

## PWA service worker

- `@vite-pwa/nuxt` in `injectManifest` mode (switched from `generateSW`), with a
  custom worker at `apps/web-nuxt/app/service-worker/sw.ts` (Workbox `precacheAndRoute` +
  `cleanupOutdatedCaches`, plus the `push` and `notificationclick` handlers for
  web push).
- `registerType: 'prompt'` - the user controls activation via the in-app banner,
  so assets never swap mid-prediction. `SKIP_WAITING` from the client triggers
  `skipWaiting()` then a controlled reload.
- `periodicSyncForUpdates: 3600` - long-lived tabs / installed PWAs see new
  deploys hourly. `globIgnores: **/skins/**` keeps easter-egg assets out of the
  precache (lazy-loaded).

The install / download / reload UX that sits on top of this worker is
[../features/pwa.md](../features/pwa.md); the push payload handling is
[../features/web-push.md](../features/web-push.md).

## Sources

- `apps/web-nuxt/server/utils/share/{token,render,template}.ts`, `apps/web-nuxt/shared/share-card.ts`
- `apps/web-nuxt/server/routes/og/share/[token].get.ts`, `apps/web-nuxt/server/api/share/mint.post.ts`
- `apps/web-nuxt/server/assets/fonts/*`
- `apps/web-nuxt/app/service-worker/sw.ts`, `apps/web-nuxt/nuxt.config.ts` (pwa block)
