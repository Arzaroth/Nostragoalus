# Client architecture

Nuxt 4 + Vue 3 SSR app. Data flows through TanStack vue-query composables; live
updates arrive over one reconnecting WebSocket. No Pinia/Vuex - state is
composables + the query cache.

## apps/web-nuxt/nuxt.config.ts (key settings)

- **Modules:** `@vueuse/nuxt`, `@primevue/nuxt-module`, `@unocss/nuxt`,
  `@nuxtjs/i18n`, `@vite-pwa/nuxt`.
- **i18n:** five locales `en / fr / th / tlh / ar`, auto-detect via the `ng_locale`
  cookie. See [i18n.md](i18n.md).
- **PWA:** `registerType: 'prompt'` (user controls SW activation so assets never
  swap mid-prediction), `periodicSyncForUpdates: 3600`, precache globs exclude
  `**/skins/**` (easter-egg assets lazy-load). See [rendering.md](rendering.md)
  and [../features/pwa.md](../features/pwa.md).
- **runtimeConfig.public:** `vapidPublicKey`, `version`, `appName` (branding is
  config-driven - the UI never hardcodes "Nostragoalus").
- **runtimeConfig (private):** `vapidPrivateKey`, `vapidSubject`, `storageDriver`
  + storage creds.
- **Theme:** custom `NostraTheme` PrimeVue preset, dark mode selector `.app-dark`.
- **Nitro:** `node-server` preset, `websocket: true`, OpenAPI at `/_docs/openapi.json`.

## Pages and routing

The active competition is a **URL path prefix**. See
[../features/competitions.md](../features/competitions.md) for the full model.

- `apps/web-nuxt/app/pages/[competition]/` - matches (list + detail), bracket, map (Leaflet),
  leaderboard, predictions/bot, teams/[code], users/[id]. The fixtures list
  auto-scrolls on load to the live (else next upcoming) match; the `users/[id]`
  profile splits picks at "now" (played above, admin-only upcoming below) and
  centers that boundary anchor on load, so it opens on the latest action rather
  than the top of a long history.
- Un-prefixed global pages - `/`, login, signup, 2FA, verify-email, account,
  preferences, about, license, roadmap, leagues (discover + join), error pages.
- Global middleware: `apps/web-nuxt/app/middleware/auth.global.ts` (redirect to /login unless
  the route is in `PUBLIC_ROUTES` or a session exists). It distinguishes "no
  session" (redirect) from a failed `getSession()` request (a transport `error`:
  leave the session alone), so a flaky mobile connection cannot eject a signed-in
  user mid-session. Also `apps/web-nuxt/app/middleware/competition.global.ts` (validate/redirect
  the `[competition]` slug, plus legacy-redirect un-prefixed pages like `/matches`
  to the path-prefixed form).

## Composables (the data layer)

`apps/web-nuxt/app/composables/use<Feature>.ts`. The query client (`apps/web-nuxt/app/plugins/vue-query.ts`)
sets app-level `staleTime: 60_000` and `refetchOnWindowFocus: false`.

Pattern: hierarchical query keys, an abort `signal`, a `select()` projection so
sibling composables share one cache entry, and invalidate-on-mutation-success.

```ts
useQuery({
  queryKey: ['leaderboard', slug, isGlobal, leagueId],
  queryFn: ({ signal }) => $fetch('/api/leaderboard', { signal, query: { competition: slug } }),
  select: (r) => r.rows,
})
```

Rough groups:
- Competition / leagues: `useCompetitions`, `useSelectedCompetition`,
  `useLeaderboard`, `useLeagues`, `useSelectedLeague`.
- Live: `useReconnectingSocket`, `usePresence`, `useLiveMatch`, `useCrowdTotals`
  (see [realtime.md](realtime.md)).
- Stats: `useStandings`, `useBracket`, `useBestScorer`, `useChampion`.
- Auth / device: `useAuth`, `usePasskeys`, `useTwoFactor`, `usePushNotifications`.
- UI state: `useSkin`, `useTheme`, `useKonamiUnlock`, `useNotifications`,
  `useChangelog`, `useRoadmap`.

## Components, plugins, layouts

- `apps/web-nuxt/app/components/**` (flat, plus `logos/`): match (lineups, odds, bracket card,
  goal animation), league (cards + dialogs + members), chat (ChatDock, ChatPanel,
  ChatMessageContent, ChatImage, ChatLightbox, EmojiPicker), admin sections,
  layout chrome (AppFooter, CompetitionPill, LeaguePill, PwaBanner,
  NotificationBell).
- `apps/web-nuxt/app/plugins/**`: `vue-query.ts` (universal), `theme.client.ts`,
  `preferences.client.ts`, `skin.client.ts`, `primevue-services.ts`,
  `pwa-status.client.ts`, `update-check.client.ts`, `tamper-watch.client.ts`,
  `chat-deeplink.client.ts`, `render-time.server.ts`.
- `apps/web-nuxt/app/layouts/`: `default.vue` (header + nav, presence broadcast, competition
  pill, admin badge) and `auth.vue` (no nav).

## Conventions and footguns

- **Tooltips:** informational hints use the PrimeVue `v-tooltip` directive
  (i18n'd in all five locales), never native `title=`. The only `title=`
  exception is revealing text cut off by `truncate`.
- **Never wrap a `.client.vue` component in `<ClientOnly>`.** It is already
  client-only by filename; doubling up makes the `#fallback` stick in the
  production build with no console error (dev masks it). Pick one mechanism.
- **Never call `useRequestURL()` (or any composable) inside a `useSeoMeta`
  getter** - unhead evaluates getters lazily during SSR, outside the Nuxt
  instance, and the page 500s. Resolve the value once in setup. Both footguns are
  prod-build-only, so verify the rendered route, not just the build. See
  [rendering.md](rendering.md).

## Sources

- `apps/web-nuxt/nuxt.config.ts`, `apps/web-nuxt/app/app.vue`, `apps/web-nuxt/app/plugins/vue-query.ts`
- `apps/web-nuxt/app/pages/**`, `apps/web-nuxt/app/composables/**`, `apps/web-nuxt/app/components/**`
- `apps/web-nuxt/app/middleware/auth.global.ts`, `apps/web-nuxt/app/middleware/competition.global.ts`
- `apps/web-nuxt/app/layouts/default.vue`
