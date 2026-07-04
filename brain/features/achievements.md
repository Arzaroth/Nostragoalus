# Achievements, trophy cabinet and "my showcase"

Two kinds of recognition hang off the [core loop](predictions-and-scoring.md):

- **Trophies** - rare, competition-end awards (the "prizes" of the contest),
  derived at finalize from the settled leaderboard/prediction state.
- **Achievements** - milestone badges earned during play, from a code-defined
  catalog, graded bronze/silver/gold.

Each user has a **trophy cabinet** (everything they can earn, lit or locked) and a
**showcase** - a curated set of up to three earned achievements they pin to show
off, per competition. Trophies still render in the cabinet but are not pinnable.
Both live on the profile page `/[competition]/users/[id]`.

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

Code, not data: `server/utils/achievements/catalog.ts` lists 22 batch-evaluated
badges (plus two secret badges) with their category, scope, grading thresholds and
whether they are hidden. `user_achievement` only records what a user unlocked. Categories:
milestone (first-blood, opening-act, sharpshooter, prophet, century, perfect-round),
streak (hot-streak, on-fire), crowd (contrarian, lone-wolf), joker (joker-hero),
behavioural (early-bird, night-owl, deadline-dancer, completionist), oracle
(champion-oracle, golden-touch, underdog-whisperer), trophy-meta (treble, podium) and
shame (cold-streak, wooden-spoon - the "bad" badges).

`evaluateAchievements` (`server/utils/achievements/service.ts`) runs each finalize
tick (after the trophy award, so treble/podium see this tick's trophies). It derives
every user's metrics once (`computeAchievementStats`: exact/points/streaks/perfect
rounds/opener/lone-wolf/oracle/underdog/completion/podium/wooden-spoon/trophy counts)
then upserts. It is idempotent and returns the badges newly earned or graded up, for
notification. A tier is a high-water mark: a rescore that lowers a metric refreshes
stored progress but never demotes the badge.

**The final-standing gate.** completionist, podium and wooden-spoon settle only once
the tournament is over - gated on `hasDecidedFinal` (`server/utils/awards/service.ts`),
the same decided-FINAL check the trophies use. Without it, completionist fired
mid-tournament off "every match scored so far" (not every match), and last-place would
flip every finalize tick. **opening-act** grades the EXACT on the earliest-kickoff
scored match (the tournament opener); it is single-GOLD (high rarity). **underdog** is
a winning champion pick ranked outside the FIFA top 15 (rank >= 16, or unranked) - a
reachable long shot, not the old effectively-impossible rank 41+.

**SHAME badges** (`cold-streak` = five MISS in a row, `wooden-spoon` = finished dead
last) are earned by doing badly. They are excluded from the-collector (`isCollectable`
/ `COLLECTABLE_ACHIEVEMENTS` in `catalog.ts`): several are mutually exclusive with the
"good" badges (you cannot finish both top-3 and last), so requiring them would make the
collector unwinnable in one competition.

**Criteria tooltips.** Every badge and trophy carries an `achievements.*.criteria`
i18n string stating the concrete unlock condition (thresholds included for graded
badges). `CabinetTile.vue` shows it in a stylized `v-tooltip` on every tile - locked
tiles prefix it with the `locked` label ("how to earn this"), earned tiles read as
"what you did". This replaced the old generic "keep playing" locked-only hint.

Because it only runs on a finalize tick that newly scores a match (`result.scored > 0`),
a competition whose matches are already scored when the feature deploys - or one that
has finished and will never finalize again - never gets its historical badges. The
manual `achievements:backfill` task (`server/tasks/achievements/backfill.ts` ->
`backfillAchievements`, admin Background-tasks page) runs the same idempotent evaluation
across every competition to grant them, silently (no unlock notifications, so a deploy
doesn't blast users with a backlog).

Behavioural timings read `prediction.createdAt` (first save) vs `match.kickoffTime`;
night-owl counts the small hours by the UTC hour explicitly (not the DB session zone).
Streaks and perfect rounds are folded in JS from the scored rows in kickoff order, with
equal kickoffs tiebroken by match id so simultaneous fixtures give a stable streak.

### The secret badges

`the-magic-word` is hidden and GLOBAL (spans competitions, null `competitionId`). It
is not batch-evaluated: it is granted from the better-auth user-update hook
(`lib/auth.ts`) when the konami skin unlock persists (`skinsUnlocked`), via
`grantAchievement` (idempotent, notifies once).

`the-collector` is also hidden and GLOBAL, but evaluated rather than event-granted:
`evaluateAchievements` grants it (idempotent) once a user holds every *collectable*
badge (`heldCount === COLLECTABLE_ACHIEVEMENTS.length` - the 20 non-secret,
non-SHAME badges). The two SHAME badges are deliberately excluded (`isCollectable`):
several are mutually exclusive with the good badges, so counting them would make the
collector unwinnable in one competition. Both secrets are kept out of the public docs
like the rest of the [easter eggs](easter-eggs.md); the copy is deliberately cryptic
so the unlock is not dangled as a to-do list.

## Cabinet and showcase

- Read: `GET /api/users/[id]/cabinet?competition=` -> `getCabinet`
  (`server/utils/achievements/cabinet.ts`) returns a `CabinetDto` (trophies,
  achievements with earned/locked status, showcase, isOwner). It mirrors the profile
  privacy gate (private profiles 404 unless owner/admin/league mate). A hidden badge
  surfaces only once earned, so a locked secret is never revealed.
- Write: `PUT /api/showcase` -> `setShowcase` replaces the owner's showcase with an
  ordered set of pins (max `SHOWCASE_SLOT_COUNT` = 3, no duplicates, achievements
  only, each one earned). Trophies cannot be pinned.
- Client: `useCabinet` / `useShowcase` composables, `TrophyCabinet.vue` +
  `CabinetTile.vue`, embedded on the profile page (competition scope only).

## Notifications

New winners/unlocks fire `TROPHY_AWARDED` / `ACHIEVEMENT_UNLOCKED`
(see [notifications](notifications.md) and [web-push](web-push.md), `tournament`
push category). The bell resolves the trophy/badge NAME via the `achievements.*`
i18n keys; push reads the same locale JSON server-side. Deep link = the recipient's
own cabinet (`cabinetPath`).

## Sources

- `db/app-schema.ts` (`competition_award`, `user_achievement`, `showcase_pin`,
  `competition.featuredTeamCode`)
- `server/utils/awards/service.ts`, `server/utils/achievements/{catalog,service,cabinet,backfill}.ts`
- `server/tasks/matches/finalize.ts` (the award + evaluate + notify hook),
  `server/tasks/achievements/backfill.ts` (manual historical backfill, listed in `server/utils/tasks/registry.ts`)
- `server/api/users/[id]/cabinet.get.ts`, `server/api/showcase/index.put.ts`
- `app/composables/use{Cabinet,Showcase}.ts`, `app/components/{TrophyCabinet,CabinetTile}.vue`
- `shared/types/achievements.ts`, i18n `achievements.*` in all five locales
- Notifications: `shared/types/notifications.ts`, `server/utils/notifications/events.ts`
