# Predictions and scoring

This is the core loop: users predict match scores before kickoff, and earn points
based on how close they were once the match is finalized. Everything else
(leagues, the crowd bot, champion and best-scorer picks, tamper-evidence) hangs
off this.

## Predicting

A prediction is a row in the `prediction` table: `userId`, `matchId`, `roundId`,
`homeGoals` and `awayGoals` (0-99), and `isJoker`. Saving goes through
`PUT /api/predictions` -> `upsertPrediction(db, ...)`. The service runs one
transaction that:

- Upserts the prediction (create or overwrite while the match is open).
- Clears any outstanding pick reminder for that match
  (see [notifications.md](notifications.md)).
- Appends to the tamper-evidence ledger when the score actually changed
  (see [tamper-evidence.md](tamper-evidence.md)).

After the save the handler publishes a crowd update so live subscribers see the
consensus move: the global total, plus a fire-and-forget per-league fan-out
(see [crowd-bot.md](crowd-bot.md), [leagues.md](leagues.md) and
[../architecture/realtime.md](../architecture/realtime.md)).

Predictions lock at kickoff. The server enforces the lock (a write after kickoff
throws `LockedError` -> 409); `lockedAt` records when. The joker toggle is a
separate endpoint, constrained to one ×2 joker per round by a partial unique
index. Turning a joker on moves it off the round's current joker match; that move
is rejected with `LockedError` (409) only when the previous joker match has
already kicked off.

## The scoring engine

Scoring is MPP-style and lives in `server/utils/scoring/`
(`engine.ts` + `bonus.ts` + `config.ts`). A prediction's points are:

1. **Base tier** - graded against the final result:
   - `EXACT` = 3 (perfect scoreline)
   - `DIFF` = 2 (right goal difference, wrong scoreline)
   - `OUTCOME` = 1 (right winner/draw only)
   - `MISS` = 0
2. **Crowd-rarity bonus** - rewards going against the crowd, computed from the
   global locked histogram of all predictions for that match. The denominator is
   always global and never shrinks for league views; `crowdMinDenominator`
   guards against tiny samples. See [crowd-bot.md](crowd-bot.md).
3. **Odds bonus** (optional) - extra points scaled by bookmaker odds when
   `oddsAppliesTo` is configured. See [odds.md](odds.md).
4. **Joker** - one ×2 multiplier per round, applied to the round's chosen match.
5. **Champion and best-scorer bonuses** - tournament-long picks scored at
   finalize. See [champion-pick.md](champion-pick.md) and
   [best-scorer.md](best-scorer.md).

### Versioned config

Scoring parameters live in the `scoring_config` table, versioned by a unique
`version` (the `id` is the primary key). Base points are plain integer columns
(`ptsExact`/`ptsDiff`/`ptsOutcome`/`ptsMiss`, defaulting to 3/2/1/0); the rarity
and long-pick tier tables are jsonb (`crowdTiers`, `crowdOutcomeTiers`,
`oddsTiers`, `championTiers`), alongside `crowdMatchBasis`, `crowdMinDenominator`
and `oddsAppliesTo`. A row with a null `competitionId` is the default; a row
scoped to a competition id overrides it for that competition, and `isActive`
selects the live row per scope. Admins edit config from the admin Scoring
section; existing awarded points are not retroactively rewritten by a config
change.

## Finalizing

Finalize is idempotent: it recomputes each finished match's points from the
stored full-time result, keyed on `resultHash` + config `version`, so a re-run
with unchanged inputs is a no-op and a rescore after a correction lands the same
numbers.

A single scheduled task, `matches:finalize` (cron `*/5 * * * *`), runs the whole
tick. `finalizeMatches(db)` wraps lock/unlock, scoring, champion awards and voids
in one transaction; the task then syncs per-match detail and awards the
best-scorer bonus.

- `finalizeMatches` locks due predictions (stamps `lockedAt`), unlocks any that
  slipped back to the future, then scores every `FINISHED` match on its 90'
  full-time result via `scoreMatchRow`. A scored match sets `match.scoringState`
  to `SCORED` (the state enum is `PENDING`/`SCORED`/`VOID`/`STALE`, and lives on
  the `match` row), stamps `resultHash`/`scoredAtVersion`, and appends an append-
  only `match_score_event` observation row. Cancelled or long-postponed matches
  are `VOID`ed and their points cleared.
- The champion bonus is awarded in the same transaction (it reads only the
  final's settled winner). The best-scorer bonus is not: it depends on
  `goal_event`, which the detail sync (`syncMatchDetails`) populates after the
  transaction, so the task awards it once the goal rows are fresh. Champion picks
  score off the stored winner and best-scorer picks off the stored `goal_event`
  rows, not a fresh provider call inside scoring.
- Finalizing emits `MATCH_RESULT` notifications (and push) to users who predicted
  the match, plus `CHAMPION_RESULT` / `BEST_SCORER_RESULT` to the winners; the
  live pushes fire only after the transaction commits.

## Related

- Who is scored: real users plus the [crowd bot](crowd-bot.md) ghost.
- Integrity of the picks: [tamper-evidence.md](tamper-evidence.md).
- Where match results come from: [../architecture/providers.md](../architecture/providers.md).

## Sources

- `server/api/predictions/index.put.ts`, `server/api/predictions/joker.put.ts`
- `server/utils/predictions/service.ts` (`upsertPrediction`)
- `server/utils/scoring/engine.ts`, `bonus.ts`, `tiers.ts`, `config.ts`, `store.ts`
- `server/utils/sync/finalize.ts` (`finalizeMatches`, `scoreMatchRow`)
- `shared/types/scoring.ts`
- `db/app-schema.ts` (`prediction`, `match_score_event`, `scoring_config`, `goal_event`)
- `server/tasks/matches/finalize.ts` (the `matches:finalize` task, registered via `server/utils/tasks/registry.ts`)
