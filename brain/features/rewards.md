# League rewards (prizes)

Real-world prizes a league attaches to the five competition-end
[trophy criteria](achievements.md). The contest is per-league (the original
"notre ligue privée" model): a league owner/moderator configures a prize for each
criterion, and the league's winner of that criterion (best **among the members**)
earns it. Distinct from the global [trophies](achievements.md), which are the best
across the whole competition.

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
- `getRewardStandings(db, leagueId, viewerId)` returns all five: each configured
  prize (or null) + the current league leader(s) (ties share) + `youHold`. A
  leader's name follows the same visibility rule as the league board
  ([leagues.md](leagues.md)): admin-hidden members and (to non-members) private
  profiles keep their slot but surface with an empty `displayName`, which the UI
  renders as a neutral "hidden player" placeholder.
- `getMyRewards(db, userId)` walks the user's leagues and returns the prizes they
  currently hold, for the cabinet strip.

## Client

- `useLeagueRewards` (standings + owner config mutation), `useMyRewards`.
- `LeagueRewards.vue` on the league page: the prizes grid (current leader, yours
  highlighted) + an owner "Edit prizes" dialog. A "prizes you hold" strip shows on
  the [cabinet](achievements.md).

## Sources

- `db/app-schema.ts` (`league_reward`), `shared/types/rewards.ts`
- `server/utils/rewards/{service,image}.ts`, `server/utils/awards/service.ts`
  (`computeCriteriaWinners`)
- `server/api/leagues/[id]/rewards.{get,put}.ts`, `server/api/me/rewards.get.ts`,
  `server/api/media/reward/[key].get.ts`
- `app/composables/use{LeagueRewards,MyRewards}.ts`, `app/components/LeagueRewards.vue`
- i18n `reward.*` in all five locales
