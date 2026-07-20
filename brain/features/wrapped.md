# Tournament Wrapped

A Spotify-Wrapped-style personal recap of the tournament: a full-screen story
deck of 8-12 slides plus a shareable summary card. Strictly post-final: it
unlocks on `hasScoredFinal` - a FINISHED FINAL with a HOME/AWAY winner whose
`scoringState` is `SCORED`. That is stricter than the trophy gate
(`hasDecidedFinal`): the winner is set by match sync, but the final-round
scoring, the champion/best-scorer bonuses and the trophy rows only land when
finalize marks the final `SCORED` (same transaction). Gating on the winner alone
would unlock a "frozen" recap in the sync -> finalize window with unscored
predictions, zeroed bonuses and an empty haul.

## Server

- `apps/web-nuxt/server/utils/wrapped/service.ts` `getWrapped(db, { competitionId, userId })`
  builds the whole `WrappedDto` (`apps/web-nuxt/shared/types/wrapped.ts`). Pre-final it
  returns `{ ready: false }` - a state, not an error, so the page can tease.
- Sources, all read-side (no new tables):
  - totals/rank/percentile from `getLeaderboard` (same visible-or-self
    population as `/api/me/stats`; a hidden/private user gets `rank: null`).
  - tier breakdown, best pick, joker stats, crowd/rarity stats from the user's
    scored `prediction` rows (`totalPoints`, `baseTier`, `bonusPoints`,
    `crowdShare` are persisted per row).
  - biggest miss = the user's MISS on the match with the highest field
    exact-share (skipped when nobody nailed it).
  - streaks / perfect rounds / lone-wolf reuse `computeAchievementStats`
    (`apps/web-nuxt/server/utils/achievements/service.ts`) so recap and badges cannot
    disagree.
  - rank journey is REPLAYED per round from scored predictions (cumulative
    ladder, `compareLeaderboardRows`), prediction points only - there is no
    rank-history table, and the champion/best-scorer bonuses land at finalize
    with no mid-tournament timeline. Every point therefore stays on one basis.
    The deck does NOT read the finishing rank off the last point, which would
    contradict the totals slide and the share card for anyone carrying a bonus:
    `journeyFinishRank` (`app/utils/wrapped-slides.ts`) takes `totals.rank`, and
    falls back to the replay only for a hidden or private user, who has no
    public standing.
  - chat stats are counts only (messages sent, reactions given/received, top
    emoji); bodies stay E2EE, reactions are plaintext glyphs by design.
  - haul from `competition_award` + `user_achievement` (global badges folded
    in).
- Route: `GET /api/me/wrapped` (self-only by construction; competition slug
  query like every competition-scoped route).

## Client

- `/[competition]/wrapped` page: teaser pre-final, else `WrappedDeck.vue` - a
  fixed-overlay story deck (tap zones, swipe, arrow keys, progress segments,
  per-slide gradients). Slide list + journey chart geometry are pure functions
  in `apps/web-nuxt/app/utils/wrapped-slides.ts` (empty slides skipped, under the 98% gate).
- Entry: a banner on the leaderboard page once `useWrapped` reports
  `ready: true` (5 min staleTime - the recap is frozen).

## Share card

Reuses the satori + resvg stack ([share-images.md](share-images.md),
[../architecture/rendering.md](../architecture/rendering.md)):

- `apps/web-nuxt/server/utils/share/wrapped-token.ts`: a second stateless HMAC token family
  (user + competition + locale), domain-separated from the prediction token so
  the two can never be swapped.
- `POST /api/share/wrapped-mint` (auth, 404 until the final is decided via the
  looser `hasDecidedFinal`; the `[token]` PNG route re-runs `getWrapped` and
  serves the not-ready fallback until the final is `SCORED`) ->
  `GET /og/wrapped/[token]` public PNG (pure template in
  `apps/web-nuxt/server/utils/share/wrapped-template.ts`; binary route outside the coverage
  gate, cached 1 day - post-final data is frozen). Both OG routes load their
  bundled fonts/mark and the non-Latin fallback font via the shared
  `apps/web-nuxt/server/utils/share/og-assets.ts` (so a CJK/Arabic display name renders on the
  card instead of tofu).
- Summary slide offers download + copy-image-link.

## Tests

Service + template + token under the coverage gate; `WrappedDeck` component
test; `apps/web-nuxt/tests/e2e/wrapped.e2e.ts` drives seed -> deck -> summary -> mint -> PNG
and the leaderboard banner.
