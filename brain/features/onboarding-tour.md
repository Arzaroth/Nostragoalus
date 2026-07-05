# Onboarding tour

A one-time spotlight walk-through for a brand-new player. A full-screen overlay
dims the page, cuts a hole around one target element at a time, and steps the
user through the core actions with a captioned card. Distinct from the
[league onboarding prompt](leagues.md) (the "got a league code?" modal): that
one gets a user into a league; this one teaches the app.

Back to the [feature index](index.md).

## Shape

- **Overlay**: [`app/components/OnboardingTour.vue`](../../app/components/OnboardingTour.vue).
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
  [`app/composables/useOnboardingTour.ts`](../../app/composables/useOnboardingTour.ts).
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
| competition | `competition` | [`CompetitionPill.vue`](../../app/components/CompetitionPill.vue) trigger |
| predict | `predict` | match card in [`matches/index.vue`](../../app/pages/[competition]/matches/index.vue) |
| champion | `champion` | the champion/best-scorer picks grid in `matches/index.vue` |
| leaderboard | `leaderboard` | the ranking nav link in [`default.vue`](../../app/layouts/default.vue) |
| notifications | `notifications` | [`NotificationBell.vue`](../../app/components/NotificationBell.vue) button |
| chat | `chat` | [`ChatDock.vue`](../../app/components/ChatDock.vue) launcher (self-skips with no league) |

`welcome` and `done` are targetless bookends.

## Persistence + auto-start

Same one-time-flag pattern as the league prompt (see [leagues.md](leagues.md)):

- Column `onboardingTourDismissedAt` on the `user` table
  ([`db/auth-schema.ts`](../../db/auth-schema.ts)), exposed on the session as a
  better-auth `additionalField` with `input: false`
  ([`lib/auth.ts`](../../lib/auth.ts)) - readable client-side, writable only by
  the service.
- Writer `dismissOnboardingTour`
  ([`server/utils/onboarding/service.ts`](../../server/utils/onboarding/service.ts)),
  idempotent via an `is null` guard, behind the thin route
  [`server/api/me/onboarding-tour.post.ts`](../../server/api/me/onboarding-tour.post.ts).
  Both exits (finish, skip) stamp it.
- **Auto-start** fires once per session when: the tour flag is unset, the
  leagues query has resolved, and the league prompt is settled (its flag set,
  the user already has a league, or - within the same session - the league
  dialog signalled it was just dismissed). Gating on the league prompt keeps two
  overlays from fighting - the tour waits until the "join a league" modal is
  done. The league dialog's server flag only reaches the session on a refetch,
  so it also calls `markLeaguePromptResolved()` (a module signal on
  `useOnboardingTour`) on any exit, which flips the tour's gate immediately and
  fires the auto-start watcher in the same session.
- **Manual replay**: a "Take the tour" item in the account menu
  ([`default.vue`](../../app/layouts/default.vue)) calls `start()`, which ignores
  the flag - always available.

## Tests

- Service: [`server/utils/onboarding/service.test.ts`](../../server/utils/onboarding/service.test.ts) (pglite; stamp, idempotent, scoped).
- Component: [`app/components/OnboardingTour.nuxt.test.ts`](../../app/components/OnboardingTour.nuxt.test.ts) (render, step bookends, skip, auto-start).
- E2E: [`tests/e2e/onboarding.e2e.ts`](../../tests/e2e/onboarding.e2e.ts) drives the launcher through every step and asserts it stays dismissed on reload.

## Notes

- The Klingon (`tlh`) and Arabic (`ar`) step copy is best-effort and, like the
  rest of those locales, wants a native-speaker pass.
