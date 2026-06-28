# Predictions and scoring

This is the core loop: users predict match scores before kickoff, and earn points
based on how close they were once the match is finalized. Everything else
(leagues, the crowd bot, champion and best-scorer picks, tamper-evidence) hangs
off this.

## Predicting

A prediction is a row in the `prediction` table: `userId`, `matchId`, `roundId`,
`homeGoals` and `awayGoals` (0-99), and `isJoker`. Saving goes through
`PUT /api/predictions` -> `upsertPrediction(db, ...)`, which runs in a
transaction and does several things at once:

- Upserts the prediction (create or overwrite while the match is open).
- Publishes a crowd update so live subscribers see the consensus move
  (see [crowd-bot.md](crowd-bot.md) and [../architecture/realtime.md](../architecture/realtime.md)).
- Clears any outstanding pick reminder for that match
  (see [notifications.md](notifications.md)).
- Appends to the tamper-evidence ledger when the score actually changed
  (see [tamper-evidence.md](tamper-evidence.md)).

Predictions lock at kickoff. The server enforces the lock (a write after kickoff
throws `LockedError` -> 409); `lockedAt` records when. The `joker` toggle is a
separate endpoint and is constrained to one ×2 joker per round
(`JokerQuotaError` -> 409 when the quota is spent).

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

Scoring parameters live in the `scoring_config` table, versioned by `version`
(primary key). The tier tables are jsonb: `baseTiers`, `crowdTiers`,
`oddsTiers`, `championTiers`, plus `crowdMatchBasis`, `crowdMinDenominator`,
`oddsAppliesTo`. Admins edit config from the admin Scoring section; existing
awarded points are not retroactively rewritten by a config change.

## Finalizing

Finalize is idempotent and "derive, don't mutate": it recomputes from the stored
match result rather than mutating prediction rows in place, so it can run again
safely.

- `predictions:finalize` is a manual task (cron `null`, triggered from the admin
  Background-tasks page or by the scoring flow). It scores on the 90' full-time
  result, writes `match_score_event` (idempotency anchor with a
  `match_scoring_state` of `PENDING`/`SCORED`/`VOID`/`STALE`), and awards the
  champion and best-scorer bonuses in the same transaction.
- It emits `MATCH_RESULT` notifications (and push) to users who predicted the
  match, plus `CHAMPION_RESULT` / `BEST_SCORER_RESULT` to the winners.
- `matches:finalize` (separate, scheduled) pulls per-match detail into
  `goal_event` rows and `match.possession*`. The stored `goal_event` rows are
  what champion/best-scorer awards are derived from, so finalize never makes a
  provider HTTP call.

## Related

- Who is scored: real users plus the [crowd bot](crowd-bot.md) ghost.
- Integrity of the picks: [tamper-evidence.md](tamper-evidence.md).
- Where match results come from: [../architecture/providers.md](../architecture/providers.md).

## Sources

- `server/api/predictions/index.put.ts`, `server/api/predictions/joker.put.ts`
- `server/utils/predictions/service.ts` (`upsertPrediction`)
- `server/utils/scoring/engine.ts`, `bonus.ts`, `config.ts`
- `shared/types/scoring.ts`
- `db/app-schema.ts` (`prediction`, `match_score_event`, `scoring_config`, `goal_event`)
- `server/tasks/**` finalize tasks (registered via `server/utils/tasks/registry.ts`)
