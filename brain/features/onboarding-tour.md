# Onboarding tour

A one-time spotlight walk-through for a brand-new player. A full-screen overlay
dims the page, cuts a hole around one target element at a time, and steps the
user through the core actions with a captioned card. Distinct from the
[league onboarding prompt](leagues.md) (the "got a league code?" modal): that
one gets a user into a league; this one teaches the app.

Back to the [feature index](index.md).

## Shape

- **Overlay**: [`apps/web-nuxt/app/components/OnboardingTour.vue`](../../apps/web-nuxt/app/components/OnboardingTour.vue).
  Client-only (reads `window` / `getBoundingClientRect`), teleports to `body`,
  sits at `z-[1000]` - above the sticky header (`z-50`) and chat/banner
  (`z-40`), below the `z-[2000]` lightboxes. The dim + spotlight is one trick: a
  hole `div` positioned over the target with a huge `box-shadow`
  (`0 0 0 9999px rgba(0,0,0,.6)`) plus a 2px primary-color ring. Bookend steps
  (welcome / done) have no target and render a plain dimmed backdrop with a
  centered card. The card auto-places below the target, flips above when there
  is no room, and clamps to the viewport; it re-measures on scroll and resize so
  the spotlight tracks through smooth-scroll and layout shifts.
- **State + gating**:
  [`apps/web-nuxt/app/composables/useOnboardingTour.ts`](../../apps/web-nuxt/app/composables/useOnboardingTour.ts).
  Module-level singleton refs (`active`, `stepIndex`) so the overlay and the
  "Take the tour" menu launcher drive one instance. `TOUR_STEPS` is the ordered
  step list; each step has an i18n `key` and an optional `target` CSS selector.
- **Steps** run against the matches page (`start()` navigates to
  `/<slug>/matches`), where the pick/champion/pill anchors live. Header targets
  (notifications) exist on every authed page. A step whose target is absent -
  or zero-size, like the chat launcher for a user with no league (`v-show`
  hidden) - self-skips after a short retry, so the tour never stalls on a
  missing anchor.

## Target anchors

Steps find their element by a `data-tour="..."` attribute (there was no such
convention before - added with this feature):

| Step | `data-tour` | Where |
|---|---|---|
| competition | `competition` | [`CompetitionPill.vue`](../../apps/web-nuxt/app/components/CompetitionPill.vue) trigger |
| predict | `predict` | match card in [`matches/index.vue`](../../apps/web-nuxt/app/pages/[competition]/matches/index.vue) |
| champion | `champion` | the champion/best-scorer picks grid in `matches/index.vue` |
| leaderboard | `leaderboard` | the ranking nav link in [`default.vue`](../../apps/web-nuxt/app/layouts/default.vue) |
| notifications | `notifications` | [`NotificationBell.vue`](../../apps/web-nuxt/app/components/NotificationBell.vue) button |
| chat | `chat` | [`ChatDock.vue`](../../apps/web-nuxt/app/components/ChatDock.vue) launcher (self-skips with no league) |

`welcome` and `done` are targetless bookends.

## Persistence + auto-start

Same one-time-flag pattern as the league prompt (see [leagues.md](leagues.md)):

- Column `onboardingTourDismissedAt` on the `user` table
  ([`apps/web-nuxt/db/auth-schema.ts`](../../apps/web-nuxt/db/auth-schema.ts)), exposed on the session as a
  better-auth `additionalField` with `input: false`
  ([`apps/web-nuxt/lib/auth.ts`](../../apps/web-nuxt/lib/auth.ts)) - readable client-side, writable only by
  the service.
- Writer `dismissOnboardingTour`
  ([`apps/web-nuxt/server/utils/onboarding/service.ts`](../../apps/web-nuxt/server/utils/onboarding/service.ts)),
  behind the thin route
  [`apps/web-nuxt/server/api/me/onboarding-tour.post.ts`](../../apps/web-nuxt/server/api/me/onboarding-tour.post.ts).
  Both exits (finish, skip) stamp it. It delegates to the shared
  `stampUserFlagOnce` ([`apps/web-nuxt/server/utils/user-flags/service.ts`](../../apps/web-nuxt/server/utils/user-flags/service.ts)),
  idempotent via an `is null` guard, shared with the leagues one-time prompt.
- **Auto-start** fires once per session as the in-session hand-off from the
  league prompt: the tour flag is unset AND `markLeaguePromptResolved()` (a module
  signal on `useOnboardingTour`) has fired this session. The league dialog calls
  that signal on any exit (dismiss or join), and only a brand-new user (no
  memberships, flag unset) ever sees that dialog - so gating on the fresh signal
  both keeps the two overlays from fighting (the tour waits for the "join a league"
  modal) and, crucially, stops the tour auto-starting for the **entire existing
  user base**: the additive migration leaves everyone's `onboardingTourDismissedAt`
  null, so gating on the durable "flag set / already has a league" state (an earlier
  design) would have popped the spotlight - and force-navigated to `/matches` - for
  every established user. The trade-off: a brand-new user auto-joined into a league
  (the prompt never shows) does not get the auto-tour and launches it from the menu
  instead.
- **Manual replay**: a "Take the tour" item in the account menu
  ([`default.vue`](../../apps/web-nuxt/app/layouts/default.vue)) calls `start()`, which ignores
  the flag - always available.

## Tests

- Service: [`apps/web-nuxt/server/utils/onboarding/service.test.ts`](../../apps/web-nuxt/server/utils/onboarding/service.test.ts) (pglite; stamp, idempotent, scoped).
- Component: [`apps/web-nuxt/app/components/OnboardingTour.nuxt.test.ts`](../../apps/web-nuxt/app/components/OnboardingTour.nuxt.test.ts) (render, step bookends, skip, auto-start).
- E2E: [`apps/web-nuxt/tests/e2e/onboarding.e2e.ts`](../../apps/web-nuxt/tests/e2e/onboarding.e2e.ts) drives the launcher through every step and asserts it stays dismissed on reload.

## Notes

- The Klingon (`tlh`) and Arabic (`ar`) step copy is best-effort and, like the
  rest of those locales, wants a native-speaker pass.
