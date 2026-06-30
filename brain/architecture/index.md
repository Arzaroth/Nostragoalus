# Architecture

The technical layers and cross-cutting subsystems. Start with
[overview.md](overview.md) for the big picture, then jump to the layer you need.
Back to the root map: [../BRAIN.md](../BRAIN.md).

| File | What's here | Grep keywords |
|---|---|---|
| [overview.md](overview.md) | Request flow, layering rule, the four code surfaces, hard rules | layering, lifecycle, coverage gate, #shared |
| [server.md](server.md) | Nitro routes, the service pattern, error classes, validated handler, tasks, plugins | service, AppDatabase, defineValidatedHandler, toHttpError, errors.ts, registry, cron |
| [client.md](client.md) | Nuxt app: pages/routing, vue-query composables, components, plugins, layouts | useQuery, queryKey, staleTime, composables, PrimeVue, UnoCSS, middleware |
| [database.md](database.md) | Drizzle schema, every table + enum, relations, migrations, connection | drizzle, migration, pglite, enum, app-schema, db:generate |
| [auth.md](auth.md) | better-auth, SSO (encrypted), passkeys, 2FA, API keys, admin model | better-auth, sso, KEK, passkey, reauth, requireUser, admin emails |
| [realtime.md](realtime.md) | Nitro WebSocket, the live hub, presence, live event types | _ws, hub, publishUserNotification, presence, useReconnectingSocket |
| [storage.md](storage.md) | Pluggable image storage (fs/s3), avatars, chat blobs, migration | StorageDriver, rustfs, aws4fetch, avatar, migrate-blobs |
| [rendering.md](rendering.md) | Server-rendered OG/share images (satori+resvg) and the PWA service worker | satori, resvg, og, woff, injectManifest, service-worker |
| [providers.md](providers.md) | External data: FIFA match data, odds, FIFA ranking, the cycletls engine | FIFA, sofascore, betexplorer, cycletls, JA3, ranking |
| [testing.md](testing.md) | The merge gate, coverage rules, pglite test DB, factories, Playwright e2e | vitest, coverage, 98%, pglite, factories, nuxt.test, e2e, playwright |
| [i18n.md](i18n.md) | The four locales and the all-locales rule | i18n, locales, en fr th tlh, Klingon |

## How to use this folder

- Each file stands alone but cites real source paths inline so you can jump to
  code when you must.
- Product features (chat, leagues, scoring, etc.) live one level up in
  [../features/](../features/index.md); this folder is the technical plumbing
  those features sit on.
