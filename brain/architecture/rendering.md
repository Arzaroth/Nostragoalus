# Rendering (server images + PWA service worker)

Two server-adjacent rendering concerns that bite if you forget their footguns:
server-rendered share/OG images, and the PWA service worker.

## OG / share images

Prediction share cards render server-side: **satori** turns a hand-rolled
HTML/CSS element tree into SVG, then **@resvg/resvg-js** rasterizes SVG to PNG.
The app does NOT use the nuxt-og-image module: the route logic and deps are kept
explicit. Product details in
[../features/share-images.md](../features/share-images.md).

Pipeline lives in `server/utils/share/*`:

- `token.ts` - stateless HMAC tokens, domain-separated from the auth secret.
  Minting (`/api/share/mint`) checks ownership; the public render trusts the
  signed token.
- the card model + the pure element template + `render.ts` (satori + resvg).
- the binary route `server/routes/og/share/[token].get.ts` is outside the
  coverage gate; the pure logic under `server/utils/share/**` is inside it.
- Cache: finished-result cards cache ~1 day, live / pre-kickoff cards ~120s.

### Two footguns (do not relearn these)

1. **satori needs `ttf` / `otf` / `woff`, NOT `woff2`, and does not fetch remote
   images.** Vendored woff fonts live in `server/assets/fonts/` (Inter Latin plus
   Noto Sans Thai for locale glyph coverage via satori's per-glyph fallback).
   Additional script subsets (ja/ko/zh/ar/he/hi, etc.) are fetched from Google
   Fonts on demand through satori's `loadAdditionalAsset` and cached, degrading
   to tofu offline. Team identity uses CODE pills (ENG/SEN) or flags inlined as
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
  custom worker at `app/service-worker/sw.ts` (Workbox `precacheAndRoute` +
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

- `server/utils/share/{token,render,template}.ts`, `shared/share-card.ts`
- `server/routes/og/share/[token].get.ts`, `server/api/share/mint.post.ts`
- `server/assets/fonts/*`
- `app/service-worker/sw.ts`, `nuxt.config.ts` (pwa block)
