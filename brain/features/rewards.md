# League rewards (prizes)

Real-world prizes a league attaches to the five competition-end
[trophy criteria](achievements.md). The contest is per-league (the original
"notre ligue privée" model): a league owner/moderator configures a prize for each
criterion, and the league's winner of that criterion (best **among the members**)
earns it - except Team Specialist, where every member who calls an exact scoreline on
the featured team wins (many holders). Distinct from the global
[trophies](achievements.md), which are computed across the whole competition.

## Config

- A prize is a row in `league_reward` (`leagueId`, `type` = a
  `competition_award_type`, `label`, `imageKey?`, `note?`, `link?`), unique per
  (league, type). Migration 0054.
- Owner/moderator only: `PUT /api/leagues/[id]/rewards` (authorized by
  `resolveLeagueManage`). A blank label clears that criterion's prize. `link` is
  validated to `http(s)` only (it renders as an anchor href to every member, so a
  `javascript:` URL would be stored XSS); `type` is the shared
  `COMPETITION_AWARD_TYPES` enum.
- The image is uploaded as a `data:` URL; the route resolves it to a storage key
  via `storeRewardFromDataUrl` (content-addressed `reward/<sha>.<ext>`, mirrors the
  avatar path) and serves it at `/api/media/reward/[key]`. The service takes a
  resolved `imageKey` so it stays storage-free and unit-testable.

## Winners are live, derived, not stored

Winners are computed at **read time**, so a league sees who is *currently* leading
each prize; it settles when the competition ends. No finalize hook, no award table.

- `computeCriteriaWinners` (`server/utils/awards/service.ts`) is the shared 5-criteria
  computation, extracted from the global trophy award and parameterized by
  `{ leagueId, memberIds }`: OVERALL via `getLeaderboard(leagueId)` (folds in the
  meta-pick bonuses), the phase / Madame-IRMA / team-specialist criteria via
  `rankableForMatches` narrowed with `inArray(prediction.userId, memberIds)`.
- `computeCriteriaWinners` collapses each criterion to its rank-1 (tie-shared)
  winners - except TEAM_SPECIALIST, which returns **every** predictor with an exact on
  the featured team (each valued by their exact count), so it has many winners and a
  person "wins it" once per exact.
- `getRewardStandings(db, leagueId, viewerId)` returns all five: each configured
  prize (or null) + the current holders (sorted by value desc; ties share) + `youHold`
  + `disabled`. The prize card shows the top holder plus a "+N others" tail
  (`reward.leaderPlusOthers`), which is what makes many-winner TEAM_SPECIALIST read
  cleanly. A holder's name follows the same visibility rule as the league board
  ([leagues.md](leagues.md)): admin-hidden members and (to non-members) private
  profiles keep their slot but surface with an empty `displayName`, which the UI
  renders as a neutral "hidden player" placeholder. `teamCode`/`disabled` for
  TEAM_SPECIALIST come from the competition's `featuredTeamCode` (see below), not
  the winner row, so the criterion reads as disabled before anyone scores.
- `getMyRewards(db, userId)` walks the user's leagues and returns every configured
  prize with `youHold`, for the cabinet strip: the ones the user leads (lit) and
  the ones they chase (tentative, greyed). Held prizes sort first.

## Per-criterion ranking (the full standings behind a prize)

The winners functions collapse most criteria to their rank-1 rows (TEAM_SPECIALIST
excepted - all its non-zero rows win); the ranking functions expose the whole ladder
so a member can click a prize and see where they stand.

- `rankCriteria(db, competitionId, type, { leagueId, memberIds, teamCode })`
  (`awards/service.ts`) returns the full ordered `{ userId, value, rank }[]` for one
  criterion (shared `criteriaMatchFilter` for the phases; OVERALL via `getLeaderboard`;
  MADAME_IRMA and TEAM_SPECIALIST ranked on EXACT count; TEAM_SPECIALIST scoped to the
  featured team, empty without one). 1224 ranking; zero-value rows are dropped.
  For the points/exact-ladder criteria the rank-1 rows are exactly
  `computeCriteriaWinners`' winners; TEAM_SPECIALIST is the exception - **every**
  non-zero row is a winner (every exact on the featured team is a reward), so the whole
  ranking is holders, valued by their exact count.
- `getRewardRanking(db, leagueId, type, viewerId)` (`rewards/service.ts`) wraps it
  for a league: the reward, the metric (`points`/`exact`), and the ranked rows with
  the same name/avatar visibility rules as the standings (extracted into
  `resolveVisibleNames`), each flagged `isViewer`. Served at
  `GET /api/leagues/[id]/rewards/[type]/ranking`.

## Team Specialist featured team (admin)

TEAM_SPECIALIST tracks the competition's `featuredTeamCode` (`competition` table).
It has no default, so the prize is **disabled** until an admin sets one.

- Admin **Competitions** section (`AdminCompetitionsSection.vue`, first tab, above
  Leagues) lists each competition with a team picker sourced from its fixtures.
- `listCompetitionsForAdmin` + `setCompetitionFeaturedTeam` (`competitions/admin.ts`,
  the latter rejecting a code not in the competition's teams) behind
  `GET`/`PUT /api/admin/competitions`; the store setter is
  `setFeaturedTeamCode` (`competitions/store.ts`).

## Client

- `useLeagueRewards` (standings + owner config mutation), `useMyRewards`,
  `useRewardRanking` (a criterion's ranking, fetched when the dialog opens),
  `useCriterionName` (shared criterion label incl. the featured-team name).
- `LeagueRewards.vue` on the league page: the prizes grid (current leader, yours
  highlighted; TEAM_SPECIALIST greyed when disabled) + an owner "Edit prizes"
  dialog. Clicking a prize opens `RewardRankingDialog.vue` (shared with the
  cabinet). A "your prizes" strip (held + chased) shows on the
  [cabinet](achievements.md), each tile opening the same dialog.

## Sources

- `db/app-schema.ts` (`league_reward`, `competition.featuredTeamCode`),
  `shared/types/rewards.ts`, `shared/types/admin-competitions.ts`
- `server/utils/rewards/{service,image}.ts`, `server/utils/awards/service.ts`
  (`computeCriteriaWinners`, `rankCriteria`, `criteriaMatchFilter`),
  `server/utils/competitions/{store,admin}.ts`
- `server/api/leagues/[id]/rewards.{get,put}.ts`,
  `server/api/leagues/[id]/rewards/[type]/ranking.get.ts`,
  `server/api/me/rewards.get.ts`, `server/api/media/reward/[key].get.ts`,
  `server/api/admin/competitions/index.{get,put}.ts`
- `app/composables/use{LeagueRewards,MyRewards,RewardRanking,CriterionName}.ts`,
  `app/components/{LeagueRewards,RewardRankingDialog,TrophyCabinet,AdminCompetitionsSection}.vue`
- i18n `reward.*` and `admin.competitions.*` in all five locales
