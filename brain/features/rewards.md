# League rewards (prizes)

Real-world prizes a league attaches to a set of reward **criteria**. The contest is
per-league (the original "notre ligue privee" model): a league owner/moderator
adds a prize for any criterion, and the league's winner of that criterion (best
**among the members**) earns it - except Team Specialist, where every member who
calls an exact scoreline on the league's featured team wins (many holders).
Distinct from the global [trophies](achievements.md), which are computed across the
whole competition over a fixed five and settled at finalize.

## The criteria

`LEAGUE_REWARD_CRITERIA` (`shared/types/rewards.ts`, mirrored by the
`league_reward_criterion` pg enum) is a superset of the global trophy set - eleven
criteria, each a `(metric x match-filter x direction)` over the same per-user
aggregates the trophies use:

| criterion | metric | subset | notes |
|---|---|---|---|
| OVERALL | points | leaderboard | folds in the meta-pick bonuses |
| WOODEN_SPOON | points | whole | inverse: the **lowest** total wins |
| GROUP_PHASE | points | group | |
| KNOCKOUT_PHASE | points | knockout | |
| FINALIST | points | the FINAL | |
| MADAME_IRMA | exact | whole | most exact scorelines |
| GROUP_ORACLE | exact | group | |
| KNOCKOUT_ORACLE | exact | knockout | |
| SHARPSHOOTER | outcome | whole | most correct win/draw/loss |
| GOAL_DIFF_GURU | goaldiff | whole | most correct goal differences |
| TEAM_SPECIALIST | exact | the league's featured team | multi-winner (every exact) |

`rewardMetricFor` (shared) maps each criterion to its display metric
(`points`/`exact`/`outcome`/`goaldiff`); `isTeamScopedCriterion` marks the one
(TEAM_SPECIALIST) that needs a team before it can be earned.

## Config

- A prize is a row in `league_reward` (`leagueId`, `type` = a
  `league_reward_criterion`, `label`, `imageKey?`, `note?`, `link?`), unique per
  (league, type) - so a criterion can hold at most one prize. Migration 0055
  retargeted `type` from `competition_award_type` to the wider enum.
- Owner/moderator only: `PUT /api/leagues/[id]/rewards` (authorized by
  `resolveLeagueManage`). **Replace-set**: the form sends the full desired list; a
  blank label clears (deletes) that criterion's prize, so a removed row is a delete.
  The route also refuses a duplicate criterion. `link` is validated to `http(s)`
  only (it renders as an anchor href to every member, so a `javascript:` URL would
  be stored XSS).
- The image is uploaded as a `data:` URL; the route resolves it to a storage key
  via `storeRewardFromDataUrl` (content-addressed `reward/<sha>.<ext>`, mirrors the
  avatar path) and serves it at `/api/media/reward/[key]`. The service takes a
  resolved `imageKey` so it stays storage-free and unit-testable.

## Winners are live, derived, not stored

Winners are computed at **read time**, so a league sees who is *currently* leading
each prize; it settles when the competition ends. No finalize hook, no award table.

- `computeLeagueRewardWinners` (`server/utils/rewards/criteria.ts`) is the engine.
  OVERALL comes off `getLeaderboard(leagueId)` (folds in the meta-pick bonuses); the
  rest come off `rankableForMatches` (exported from `awards/service.ts`) narrowed with
  `inArray(prediction.userId, memberIds)`. It runs one query per distinct match subset
  (whole / group / knockout / final / team), not one per criterion.
- `winnersFromRankable` collapses each criterion to its rank-1 (tie-shared) winners:
  the top-ladder rows for points criteria, the max-value rows for count criteria, the
  **lowest** for WOODEN_SPOON. TEAM_SPECIALIST is the exception - **every** predictor
  with an exact on the featured team holds it (valued by their exact count), so it has
  many winners and a person "wins it" once per exact.
- `getRewardStandings(db, leagueId, viewerId)` (`rewards/service.ts`) returns all
  eleven: each configured prize (or null) + the current holders (sorted by value desc;
  ties share) + `metric` + `youHold` + `disabled`. The card shows the top holder plus a
  "+N others" tail, which is what makes many-winner TEAM_SPECIALIST read cleanly. A
  holder's name follows the league board's visibility rule ([leagues.md](leagues.md)):
  admin-hidden members and (to non-members) private profiles keep their slot but
  surface with an empty `displayName`, rendered as a neutral "hidden player"
  placeholder. `teamCode`/`disabled` for TEAM_SPECIALIST come from the league's
  `featuredTeamCode` (see below), so the criterion reads as disabled before a team is
  picked.
- `getMyRewards(db, userId)` walks the user's leagues and returns every configured
  prize with `youHold`, for the cabinet strip: the ones the user leads (lit) and the
  ones they chase (tentative, greyed). Held prizes sort first.

## Per-criterion ranking (the full standings behind a prize)

- `rankLeagueCriterion(db, competitionId, type, { leagueId, memberIds, featuredTeamCode })`
  (`criteria.ts`) returns the full ordered `{ userId, value, rank }[]` for one criterion:
  OVERALL via `getLeaderboard`; the rest via `rankableForMatches` on the criterion's
  subset, ranked on its metric (WOODEN_SPOON **ascending**, so rank 1 is the lowest and a
  zero is a legitimate last place). 1224 dense ranking; zero-value rows are dropped
  except for WOODEN_SPOON.
- `getRewardRanking(db, leagueId, type, viewerId)` (`rewards/service.ts`) wraps it for a
  league: the reward, the `metric`, and the ranked rows with the same name/avatar
  visibility rules as the standings (`resolveVisibleNames`), each flagged `isViewer`.
  Served at `GET /api/leagues/[id]/rewards/[type]/ranking`.

## Team Specialist featured team (per league)

TEAM_SPECIALIST tracks the **league's** `featuredTeamCode` (`league` table), picked by
an owner/moderator. There is no default, so the prize is **disabled** until they pick a
team. (This replaced the old admin-global, per-competition featured team; see
[decisions.md](../decisions.md).)

- Set via the same `PUT /api/leagues/[id]` league-update route
  (`setLeagueFeaturedTeam`, which rejects a code not in the competition's teams). The
  team picker in the prize editor sources the list from the public
  `GET /api/competitions/teams`.
- No global Team Specialist trophy is minted any more; historical `competition_award`
  rows of that type still render in the cabinet.

## Client

- `useLeagueRewards` (standings + owner config mutation), `useMyRewards`,
  `useRewardRanking` (a criterion's ranking, fetched when the dialog opens),
  `useCriterionName` (shared criterion label incl. the featured-team name, from the
  `reward.criterion.*` i18n).
- `LeagueRewards.vue` on the league page: the prizes grid (current leader, yours
  highlighted; TEAM_SPECIALIST greyed when disabled) + an owner **Edit prizes** dialog
  that adds/removes prizes from the unused-criteria dropdown and, for TEAM_SPECIALIST,
  picks the featured team. Clicking a prize opens `RewardRankingDialog.vue` (shared with
  the cabinet). A "your prizes" strip (held + chased) shows on the
  [cabinet](achievements.md), each tile opening the same dialog.

## Sources

- `db/app-schema.ts` (`league_reward`, `league.featuredTeamCode`,
  `league_reward_criterion` enum), `shared/types/rewards.ts`
- `server/utils/rewards/{service,criteria,image}.ts`, `server/utils/awards/service.ts`
  (`rankableForMatches`, `computeCriteriaWinners`, `criteriaMatchFilter`)
- `server/api/leagues/[id]/rewards.{get,put}.ts`,
  `server/api/leagues/[id]/rewards/[type]/ranking.get.ts`,
  `server/api/leagues/[id]/index.put.ts` (featured team),
  `server/api/me/rewards.get.ts`, `server/api/media/reward/[key].get.ts`
- `app/composables/use{LeagueRewards,MyRewards,RewardRanking,CriterionName}.ts`,
  `app/components/{LeagueRewards,RewardRankingDialog,TrophyCabinet}.vue`
- i18n `reward.*` (incl. `reward.criterion.*`) in all five locales
