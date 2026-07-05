# Personal analytics (bias detector)

A per-competition report on the signed-in user's own predictions, measured
against what actually happened. Where [Tournament Wrapped](wrapped.md) is a
post-final celebratory recap, analytics is a plain, honest scouting report that
works **mid-tournament**: it reads whatever scored picks exist so far.

## What it shows

- **Summary**: scored picks, total points, avg points/pick, accuracy (share of
  picks that were at least a correct outcome).
- **Tier mix**: exact / goal-difference / outcome / miss counts, as a bar.
- **Goals lean**: mean total goals predicted per match vs actual; a positive lean
  means the user over-predicts goals.
- **Outcome lean**: predicted vs actual home/draw/away distribution, with badges
  for a home-win bias and draw-blindness (predicting far fewer draws than happen).
- **Team bias**: the teams the user most over-rates (predicted to win more than
  they did) and under-rates, gated to a minimum sample so a one-off doesn't rank.
- **Accuracy by round**: a bar per round (taller = more points, brighter = more
  accurate), in round sort order.
- **Best call / biggest miss**: the top-scoring pick (tie broken toward the higher
  tier) and the miss with the largest goal error (tie broken toward a joker).

## How it works

- `server/utils/analytics/service.ts` - `getAnalytics(db, { competitionId, userId })`
  fetches the user's scored picks (`prediction.totalPoints IS NOT NULL`, joined to
  a `match` with a final score and its `round`) and hands the raw rows to the pure
  `computeAnalytics(competitionName, rows)`. All aggregation lives in that pure
  function, so the whole report is unit-tested without a database. Outcome
  derivation reuses `outcomeOf` from [`server/utils/scoring/tiers.ts`](../../server/utils/scoring/tiers.ts).
- Route `server/api/me/analytics.get.ts` - a thin `me`-scoped GET mirroring
  `me/wrapped.get.ts` (auth via `requireUser`, `resolveCompetition`, `toHttpError`),
  but with **no final gate**: `{ hasData: false }` until the user has a scored pick.
- DTO in [`#shared/types/analytics`](../../shared/types/analytics.ts).
- Client: `app/composables/useAnalytics.ts` (vue-query, key `['analytics', slug]`)
  -> `app/pages/[competition]/analytics.vue` (signed-in gate + empty state) ->
  presentational `app/components/AnalyticsReport.vue` (prop `data`, pure render,
  CSS-width bars in the spirit of `ReactionBar.vue`).
- Nav: a signed-in-only "Analytics" link in `app/layouts/default.vue`'s `navLinks`.

## Notes

- Not league-scoped: it reports the user's base picks across the competition.
- No new i18n beyond the `analytics.*` namespace and `nav.analytics` in all five
  locales.
