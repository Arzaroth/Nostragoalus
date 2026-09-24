# Champion pick

A per-competition bet on who lifts the trophy. Each user picks one team before
the tournament starts; if that team wins the competition, they get a bonus whose
size depends on how unlikely the pick was.

## Mechanics

- The pick is a row in `champion_pick` (`userId`, `competitionId`, `teamCode`,
  `teamName`, `fifaRank`, `potentialPoints`, `awardedPoints`, plus the repick
  columns `repicked`, `originalTeamCode`, `originalTeamName`).
- Points use **FIFA-rank tier buckets**, not a flat bonus. Default tiers
  (`DEFAULT_CHAMPION_TIERS`, stored in `scoring_config.champion_tiers` jsonb):

  | FIFA rank at pick time | Bonus |
  |---|---|
  | 1 - 8 | 10 |
  | 9 - 20 | 15 |
  | 21 - 40 | 25 |
  | 41+ | 40 |

  A team whose rank is unknown because it is not in the FIFA table gets the
  catch-all top tier (the biggest long-shot payout), not the flat bonus. The
  flat `championBonus` is the fallback only when the FIFA ranking fetch itself
  fails and no ranks are available at all. Picking a lower-ranked team is a
  bigger gamble and pays more.
- Rugby competitions rank against World Rugby's table instead
  (`getRanksForCompetition` picks the source by sport, per men's/women's
  sub-feed), with tighter `RUGBY_CHAMPION_TIERS`: 1-4 = 10, 5-10 = 15,
  11-20 = 25, 21+ = 40. The column is still named `fifaRank`.
- **The rank and payout (`potentialPoints`) are snapshotted on the pick at pick
  time and never recomputed.** If the team's FIFA rank changes later, the
  locked-in payout does not move. The one exception is the manual
  `champion:backfill-ranks` task (`champion/backfill.ts`), which repairs
  football picks saved with a null rank during a ranking-fetch outage, against
  the live table or the bundled pick-window snapshot
  (`fifa-ranking-snapshot.ts`). The FIFA ranking source and its quirks are documented in
  [../architecture/providers.md](../architecture/providers.md).

## Locking and repicks

- The pick locks at the first kickoff of the competition (`getChampionLockTime`),
  the same lock used by the [best-scorer pick](best-scorer.md).
- Before the lock the pick can be edited freely (`setChampionPick`, last write
  wins).
- A repick is a second chance (`repickChampion`, `PUT` with `repick: true`)
  open only in the window from the last group round's first kickoff to the
  first knockout kickoff (`getSecondChanceWindow` in `server/utils/picks/window.ts`).
  The first switch latches `repicked` for good (reverting does not clear it) and
  keeps the pre-switch pick in `original*` for display; the new team's rank and
  payout are re-snapshotted, and the award pays half, floored. A first pick made
  late, inside the window, is born `repicked`.

## The crowd bot's champion

The [crowd bot](crowd-bot.md) holds a virtual champion pick equal to the
most-picked team across all users. It pays the modal snapshot of its crowd and
breaks ties low, so the ghost never out-ranks a real user on a tie.

## Scoring

The champion bonus is awarded inside the idempotent finalize transaction (see
[predictions-and-scoring.md](predictions-and-scoring.md)) once a `FINAL` has a
decided `winner`: `awardChampionBonuses` zeroes every pick of the competition,
then re-awards the winners every tick (this heals a `winner` the provider fills
in late). A `CHAMPION_RESULT` notification goes to the winners only when the set
of holders actually changes, so a dismissed notification is not resurrected.

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`champion_pick`, `scoring_config.champion_tiers`)
- `apps/web-nuxt/app/composables/useChampion.ts`, `apps/web-nuxt/server/api/champion/index.put.ts`
- `apps/web-nuxt/server/utils/champion/ranking.ts` (`getFifaRanks`, `getRanksForCompetition`) and
  `apps/web-nuxt/server/utils/champion/service.ts` (`getChampionLockTime`, `setChampionPick`, `repickChampion`,
  `awardChampionBonuses`)
- `apps/web-nuxt/server/utils/picks/window.ts` (`getSecondChanceWindow`)
- `apps/web-nuxt/server/utils/champion/backfill.ts`, `apps/web-nuxt/server/tasks/champion/backfill-ranks.ts`
- `apps/web-nuxt/server/utils/scoring/config.ts` (`DEFAULT_CHAMPION_TIERS`, `RUGBY_CHAMPION_TIERS`, `championPointsForRank`)
- Shares its picker showcase, query/mutation plumbing, leaderboard bonus merge
  and result notification with the [best-scorer pick](best-scorer.md):
  `apps/web-nuxt/app/components/MetaPickShowcase.vue`, `apps/web-nuxt/app/composables/useMetaPick.ts`,
  `collectMetaBonus` (`apps/web-nuxt/server/utils/leaderboard/service.ts`) and `notifyMetaResult`
  (`apps/web-nuxt/server/utils/notifications/events.ts`).
