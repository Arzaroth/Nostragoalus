# Achievements, trophy cabinet and "my fridge"

Two kinds of recognition hang off the [core loop](predictions-and-scoring.md):

- **Trophies** - rare, competition-end awards (the "prizes" of the contest),
  derived at finalize from the settled leaderboard/prediction state.
- **Achievements** - milestone badges earned during play, from a code-defined
  catalog, graded bronze/silver/gold.

Each user has a **trophy cabinet** (everything they can earn, lit or locked) and a
**fridge** - the curated subset they pin to show off, per competition. Both live on
the profile page `/[competition]/users/[id]`.

## The five trophies

Computed by `awardCompetitionTrophies` (`server/utils/awards/service.ts`), gated on
a decided FINAL (same trigger as the [champion](champion-pick.md) /
[best-scorer](best-scorer.md) bonuses) and reconciled idempotently into
`competition_award`. Ties share a trophy (one row per (competition, user, type)).

| Type | Who wins it | Metric |
|---|---|---|
| `OVERALL` | the [leaderboard](predictions-and-scoring.md) winner (folds in champion + best-scorer bonuses) | total points |
| `GROUP_PHASE` | best predictor over `stage='GROUP'` matches | prediction points in phase |
| `KNOCKOUT_PHASE` | best predictor over the knockout stages | prediction points in phase |
| `MADAME_IRMA` | most EXACT scorelines of anyone | EXACT count |
| `TEAM_SPECIALIST` | best predictor of the competition's featured team | points on that team's matches |

The featured team is `competition.featuredTeamCode` (nullable; default `FRA` for the
World Cup, from the original ID Capture x AXEO contest's "best France predictor"
prize). Phase trophies use pure prediction points (no meta-pick bonus, which is not
phase-attributable); OVERALL uses the full leaderboard so it matches the standings.

## The achievement catalog

Code, not data: `server/utils/achievements/catalog.ts` lists ~20 batch-evaluated
badges (plus one secret) with their category, scope, grading thresholds and whether
they are hidden. `user_achievement` only records what a user unlocked. Categories:
milestone (first-blood, sharpshooter, prophet, century, perfect-round), streak
(hot-streak, on-fire), crowd (contrarian, lone-wolf), joker (joker-hero), behavioural
(early-bird, night-owl, deadline-dancer, completionist), oracle (champion-oracle,
golden-touch, underdog-whisperer) and trophy-meta (treble, podium).

`evaluateAchievements` (`server/utils/achievements/service.ts`) runs each finalize
tick (after the trophy award, so treble/podium see this tick's trophies). It derives
every user's metrics once (`computeAchievementStats`: exact/points/streaks/perfect
rounds/lone-wolf/oracle/underdog/completion/podium/trophy counts) then upserts. It is
idempotent and returns the badges newly earned or graded up, for notification. A tier
is a high-water mark: a rescore that lowers a metric refreshes stored progress but
never demotes the badge.

Behavioural timings read `prediction.createdAt` (first save) vs `match.kickoffTime`;
night-owl counts the small hours by the UTC hour explicitly (not the DB session zone).
Streaks and perfect rounds are folded in JS from the scored rows in kickoff order, with
equal kickoffs tiebroken by match id so simultaneous fixtures give a stable streak.

### The secret badge

`the-magic-word` is hidden and GLOBAL (spans competitions, null `competitionId`). It
is not batch-evaluated: it is granted from the better-auth user-update hook
(`lib/auth.ts`) when the konami skin unlock persists (`skinsUnlocked`), via
`grantAchievement` (idempotent, notifies once). Kept out of the public docs like the
rest of the [easter eggs](easter-eggs.md); the copy is deliberately cryptic.

## Cabinet and fridge

- Read: `GET /api/users/[id]/cabinet?competition=` -> `getCabinet`
  (`server/utils/achievements/cabinet.ts`) returns a `CabinetDto` (trophies,
  achievements with earned/locked status, fridge, isOwner). It mirrors the profile
  privacy gate (private profiles 404 unless owner/admin/league mate). A hidden badge
  surfaces only once earned, so a locked secret is never revealed.
- Write: `PUT /api/fridge` -> `setFridge` replaces the owner's fridge with an ordered
  set of pins (max `FRIDGE_SLOT_COUNT` = 6, no duplicates, only earned items).
- Client: `useCabinet` / `useFridge` composables, `TrophyCabinet.vue` +
  `CabinetTile.vue`, embedded on the profile page (competition scope only).

## Notifications

New winners/unlocks fire `TROPHY_AWARDED` / `ACHIEVEMENT_UNLOCKED`
(see [notifications](notifications.md) and [web-push](web-push.md), `tournament`
push category). The bell resolves the trophy/badge NAME via the `achievements.*`
i18n keys; push reads the same locale JSON server-side. Deep link = the recipient's
own cabinet (`cabinetPath`).

## Sources

- `db/app-schema.ts` (`competition_award`, `user_achievement`, `fridge_pin`,
  `competition.featuredTeamCode`)
- `server/utils/awards/service.ts`, `server/utils/achievements/{catalog,service,cabinet}.ts`
- `server/tasks/matches/finalize.ts` (the award + evaluate + notify hook)
- `server/api/users/[id]/cabinet.get.ts`, `server/api/fridge/index.put.ts`
- `app/composables/use{Cabinet,Fridge}.ts`, `app/components/{TrophyCabinet,CabinetTile}.vue`
- `shared/types/achievements.ts`, i18n `achievements.*` in all five locales
- Notifications: `shared/types/notifications.ts`, `server/utils/notifications/events.ts`
