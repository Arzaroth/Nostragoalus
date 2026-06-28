# Champion pick

A per-competition bet on who lifts the trophy. Each user picks one team before
the tournament starts; if that team wins the competition, they get a bonus whose
size depends on how unlikely the pick was.

## Mechanics

- The pick is a row in `champion_pick` (`userId`, `competitionId`, `teamCode`,
  `teamName`, `awardedPoints`).
- Points use **FIFA-rank tier buckets**, not a flat bonus. Default tiers
  (`DEFAULT_CHAMPION_TIERS`, stored in `scoring_config.champion_tiers` jsonb):

  | FIFA rank at pick time | Bonus |
  |---|---|
  | 1 - 8 | 10 |
  | 9 - 20 | 15 |
  | 21 - 40 | 25 |
  | 41+ | 40 |

  A team with an unknown rank falls back to the flat `championBonus`. Picking a
  lower-ranked team is a bigger gamble and pays more.
- **The rank and payout are snapshotted on the pick at pick time and never
  recomputed.** If the team's FIFA rank changes later, the locked-in payout does
  not move. The FIFA ranking source and its quirks are documented in
  [../architecture/providers.md](../architecture/providers.md).

## Locking and repicks

- The pick locks at the first kickoff of the competition (`getChampionLockTime`),
  the same lock used by the [best-scorer pick](best-scorer.md).
- A repick is a one-time second-chance: changing the pick is allowed once and
  halves the potential points (the snapshot is recomputed for the new team, then
  halved).

## The crowd bot's champion

The [crowd bot](crowd-bot.md) holds a virtual champion pick equal to the
most-picked team across all users. It pays the modal snapshot of its crowd and
breaks ties low, so the ghost never out-ranks a real user on a tie.

## Scoring

The champion bonus is awarded inside the idempotent finalize transaction (see
[predictions-and-scoring.md](predictions-and-scoring.md)) once the competition
winner is known, and a `CHAMPION_RESULT` notification goes to the winners.

## Sources

- `db/app-schema.ts` (`champion_pick`, `scoring_config.champion_tiers`)
- `app/composables/useChampion.ts`, `server/api/champion/index.put.ts`
- `server/utils/champion/ranking.ts` (`championPointsForRank`, `getFifaRanks`)
- `server/utils/scoring/config.ts` (`DEFAULT_CHAMPION_TIERS`, `getChampionLockTime`)
