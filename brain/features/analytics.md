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
- **Streak**: the run of consecutive correct picks (at least a right outcome) that
  is still live at the most recent scored pick, plus the longest run anywhere in
  the tournament. Hidden until a run of at least one exists.
- **Accuracy by round**: an SVG sparkline of the correct-pick rate round by round,
  in round sort order, with a per-round hover band (accuracy and points).
- **Best call / biggest miss**: the top-scoring pick (tie broken toward the higher
  tier) and the miss with the largest goal error (tie broken toward a joker).
- **Fergie time**: how the user's **real points** (base + crowd/odds rarity bonus,
  joker applied) moved on added-time goals. Each match is **replayed goal by goal**
  in chronological order; every added-time goal is priced with the full scoring
  engine for the scoreline just before vs just after it, and the delta is banked -
  positive to `won`, negative to `lost`. Because it is per-goal, a match that is
  nailed then broken in stoppage (2-0 -> your exact 2-1 -> 3-1) shows a gain **and**
  a loss while its net telescopes to full-time-minus-baseline. The card shows the
  net, the explicit `won / lost` split, and a per-match breakdown of every match
  whose points moved. Only shown when a picked match had an added-time goal.

## How it works

- `server/utils/analytics/service.ts` - `getAnalytics(db, { competitionId, userId })`
  fetches the user's scored picks (`prediction.totalPoints IS NOT NULL`, joined to
  a `match` with a final score and its `round`) and hands the raw rows to the pure
  `computeAnalytics(competitionName, rows)`. All aggregation lives in that pure
  function, so the whole report is unit-tested without a database. Outcome
  derivation reuses `outcomeOf` from [`server/utils/scoring/tiers.ts`](../../server/utils/scoring/tiers.ts).
  The streak is derived from the same rows, which the query orders by
  `(kickoffTime, match.id)` so the trailing run is deterministic even when
  group-finale matches kick off at the same time.
- Fergie time is priced separately in [`analytics/fergie.ts`](../../server/utils/analytics/fergie.ts)
  (`computeFergie`), because it needs the whole field to re-run the rarity bonus,
  and passed into `computeAnalytics`. `getAnalytics` loads, only for the picked
  matches that have an added-time [`goal_event`](../../db/app-schema.ts): the goal
  timeline (ordered by id for a stable sequence), and the whole **locked** field
  per match (the exact set finalize scored, so `scorePredictions` reproduces the
  real total at any hypothetical scoreline). `parseMinute` reads the free-text
  `minute` (`"90'+5'"` -> base 90 / added 5): a goal is Fergie added-time when it
  carries a `+` **and** its base minute is 90 or later (second-half stoppage on;
  a first-half `"45'+2'"` does not count), and the base+added drives the
  chronological sort. `computeFergie` replays each match from 0-0 and returns
  nothing for a match it cannot trust - **any unparseable/absent minute** (order
  unknown) or a goal set that **does not reconcile with the full-time score** - so
  a gap in the feed never invents a swing. `forceJoker` mirrors
  `countsDouble(stage)`; ODDS configs resolve each hypothetical outcome's closing
  odds, CROWD (the default) needs none. In a **knockout** (`isKnockout(stage)`) an
  added-time goal struck from a **drawn** scoreline banks nothing: a draw at 90'
  goes to extra time rather than standing, so that pre-goal draw is not a would-be
  result. A goal from a decisive score still counts, including an equalizer
  (1-0 -> 1-1) that takes a real lead away.
- Route `server/api/me/analytics.get.ts` - a thin `me`-scoped GET mirroring
  `me/wrapped.get.ts` (auth via `requireUser`, `resolveCompetition`, `toHttpError`),
  but with **no final gate**: `{ hasData: false }` until the user has a scored pick.
- DTO in [`#shared/types/analytics`](../../shared/types/analytics.ts).
- Client: `app/composables/useAnalytics.ts` (vue-query, key `['analytics', slug]`)
  -> `app/pages/[competition]/analytics.vue` (signed-in gate + empty state) ->
  presentational `app/components/AnalyticsReport.vue` (prop `data`, pure render).
  The accuracy sparkline is drawn with the shared
  [`app/utils/sparkline.ts`](../../app/utils/sparkline.ts) geometry helpers
  (`sparkBands`/`sparkLine`/`sparkArea`), also used by the
  [head-to-head](head-to-head.md) lead chart.
- Nav: a signed-in-only "Analytics" link in `app/layouts/default.vue`'s `navLinks`.

## Notes

- Not league-scoped: it reports the user's base picks across the competition.
- i18n lives under the `analytics.*` namespace (plus `nav.analytics`) in all five
  locales; the Fergie time card adds `analytics.fergie*` keys and the streak adds
  `analytics.streak*` there.
- Related but distinct: [head-to-head](head-to-head.md) compares two players'
  picks, where analytics reports on one.
