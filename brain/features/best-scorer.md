# Best scorer (Golden Boot) pick

A tournament-long pick that mirrors the [champion pick](champion-pick.md): each
user picks one player before the tournament starts, and earns a bonus if that
player wins the Golden Boot (most goals).

## Mechanics

- The pick is a row in `best_scorer_pick` (`userId`, `competitionId`, `playerId`,
  `playerName`, `awardedPoints`). Added in migration 0018.
- The UI is a two-step squad selection: pick a team, then pick a player from that
  team's squad. Squads come from the existing `/api/teams/[code]` endpoint (FIFA
  `getTeamTournament`).
- The winner is resolved from the stored `goal_event` rows, not a live provider
  call: own goals are excluded, and if several players tie at the maximum goal
  count they all win. Because it reads `goal_event`, the award is computed inside
  the finalize transaction with no provider HTTP (see
  [predictions-and-scoring.md](predictions-and-scoring.md)).
- Bonus size is `bestScorerBonus`, default 10 (same shape as the champion bonus).

## Locking and repicks

- Locks at the first kickoff of the competition, reusing
  `getChampionLockTime` (the same lock as the [champion pick](champion-pick.md)).
- Repick is a one-time second-chance that halves the potential points.

## Presentation

Player headshots come from the FIFA picture API `players-sq-3/{playerId}`
(`playerPhotoUrl` in `app/utils/format.ts`), falling back to the team flag if the
image fails to load.

## Scoring

Awarded idempotently in the finalize transaction, with a `BEST_SCORER_RESULT`
notification to the winners.

## Sources

- `db/app-schema.ts` (`best_scorer_pick`, `goal_event`)
- `app/composables/useBestScorer.ts`, `server/api/best-scorer/index.put.ts`
- `server/utils/bestscorer/service.ts`
- `app/utils/format.ts` (`playerPhotoUrl`)
- `drizzle/0018_best_scorer.sql`
- Shares its picker showcase, query/mutation plumbing, leaderboard bonus merge
  and result notification with the [champion pick](champion-pick.md):
  `app/components/MetaPickShowcase.vue`, `app/composables/useMetaPick.ts`,
  `collectMetaBonus` (`server/utils/leaderboard/service.ts`) and `notifyMetaResult`
  (`server/utils/notifications/events.ts`).
