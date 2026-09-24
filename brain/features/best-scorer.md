# Best scorer (Golden Boot) pick

A tournament-long pick that mirrors the [champion pick](champion-pick.md): each
user picks one player before the tournament starts, and earns a bonus if that
player wins the Golden Boot (most goals).

## Mechanics

- The pick is a row in `best_scorer_pick` (`userId`, `competitionId`, `playerId`,
  `playerName`, `teamCode`, `teamName`, `awardedPoints`, plus the repick columns
  `repicked`, `originalPlayerName`, `originalTeamCode`). Added in migration 0018.
- The UI (`BestScorerPick.vue`) is a two-step squad selection: pick a team, then
  pick a player from that team's squad. Squads come from the existing
  `/api/teams/[code]` endpoint (the competition provider's `getTeamTournament`).
- The winner is resolved from the stored `goal_event` rows (`topScorerPlayerIds`),
  not a live provider call: own goals are excluded, and if several players tie at
  the maximum count they all win. It counts rows, so for rugby every scoring play
  counts, not just tries.
- Bonus size is the flat `bestScorerBonus`, default 10 (no rank tiers, unlike the
  champion bonus).

## Locking and repicks

- Locks at the first kickoff of the competition, reusing
  `getChampionLockTime` (the same lock as the [champion pick](champion-pick.md)).
- Repick (`repickBestScorer`) is the same second-chance window as the champion
  pick (last group round -> knockouts, `getSecondChanceWindow`): the first switch
  latches `repicked`, keeps the original for display, and halves the award
  (floored). A late first pick inside the window is born halved.

## Presentation

Player headshots come from the FIFA picture API `players-sq-3/{playerId}`, or
UEFA's image CDN for a UEFA-provider competition (`playerPhotoUrl` in
`apps/web-nuxt/app/utils/format.ts`), falling back to the team flag if the
image fails to load.

## Scoring

Awarded by the `matches:finalize` task, NOT inside the finalize transaction: it
runs after the per-match detail sync that populates `goal_event` (see
[predictions-and-scoring.md](predictions-and-scoring.md)). `awardBestScorerBonuses`
is idempotent and self-gated on a decided `FINAL` (an earlier award would crown a
transient leader): it zeroes held bonuses, then re-awards the current winners
every tick. A `BEST_SCORER_RESULT` notification goes out only when the set of
holders changes, and that `changed` flag also re-triggers the trophy award.

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`best_scorer_pick`, `goal_event`)
- `apps/web-nuxt/app/composables/useBestScorer.ts`, `apps/web-nuxt/server/api/best-scorer/index.put.ts`
- `apps/web-nuxt/server/utils/bestscorer/service.ts` (`setBestScorerPick`, `repickBestScorer`, `topScorerPlayerIds`, `awardBestScorerBonuses`)
- `apps/web-nuxt/server/utils/picks/window.ts`, `apps/web-nuxt/server/tasks/matches/finalize.ts`
- `apps/web-nuxt/app/components/BestScorerPick.vue`
- `apps/web-nuxt/app/utils/format.ts` (`playerPhotoUrl`)
- `apps/web-nuxt/drizzle/0018_best_scorer.sql`
- Shares its picker showcase, query/mutation plumbing, leaderboard bonus merge
  and result notification with the [champion pick](champion-pick.md):
  `apps/web-nuxt/app/components/MetaPickShowcase.vue`, `apps/web-nuxt/app/composables/useMetaPick.ts`,
  `collectMetaBonus` (`apps/web-nuxt/server/utils/leaderboard/service.ts`) and `notifyMetaResult`
  (`apps/web-nuxt/server/utils/notifications/events.ts`).
