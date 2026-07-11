# Achievements, trophy cabinet and "my showcase"

Two kinds of recognition hang off the [core loop](predictions-and-scoring.md):

- **Trophies** - rare, competition-end awards (the "prizes" of the contest),
  derived at finalize from the settled leaderboard/prediction state.
- **Achievements** - milestone badges earned during play, from a code-defined
  catalog, graded bronze/silver/gold - plus a rare fourth **diamond** tier above
  gold (currently only Champion's Path's all-exact grade).

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

Phase trophies use pure prediction points (no meta-pick bonus, which is not
phase-attributable); OVERALL uses the full leaderboard so it matches the standings.

`TEAM_SPECIALIST` is still a value in `competition_award_type` but is **no longer
minted** as a global trophy: the featured team moved from the competition to each
league, so there is no competition-wide team to compute it from. `computeCriteriaWinners`
emits only the four above; any historical TEAM_SPECIALIST rows still render in the
cabinet. It lives on as a per-league prize criterion - see
[rewards.md](rewards.md).

## The achievement catalog

Code, not data: `server/utils/achievements/catalog.ts` lists 27 batch-evaluated
badges (plus two secret badges) with their category, scope, grading thresholds and
whether they are hidden. `user_achievement` only records what a user unlocked. Categories:
milestone (first-blood, opening-act, grand-finale, bore-draw, goal-rush, nemesis,
sharpshooter, prophet, century, perfect-round, form-reader, group-guru), streak
(hot-streak, on-fire), crowd (contrarian, lone-wolf), joker (joker-hero), behavioural
(early-bird, night-owl, deadline-dancer, set-and-forget, completionist), oracle
(champion-oracle, golden-touch, underdog-whisperer, champions-path), trophy-meta
(treble, podium) and shame (cold-streak, wooden-spoon - the "bad" badges).

Two milestone KEYS carry a display name that reads counter to the key (the key never
changes, the i18n name did): `opening-act` shows as **"First Blood"** (nailing the
tournament's opening match) and `first-blood` shows as **"The Hunt Is On"** (your
first exact of a competition). `grand-finale` is the bookend to `opening-act` - the
FINAL match called EXACT. Some same-category badges set a per-key `icon` override in
`catalog.ts` (e.g. opener flag vs final crown) so they don't all share the category icon.

`evaluateAchievements` (`server/utils/achievements/service.ts`) runs each finalize
tick (after the trophy award, so treble/podium see this tick's trophies). It derives
every user's metrics once (`computeAchievementStats`: exact/points/streaks/perfect
rounds/opener/lone-wolf/oracle/underdog/completion/podium/wooden-spoon/trophy counts)
then upserts. It is idempotent and returns the badges newly earned or graded up, for
notification. A tier is a high-water mark: a rescore that lowers a metric refreshes
stored progress but never demotes the badge - so streaks and tallies survive a
transient rescore dip. The exception is `revocable` badges (in `catalog.ts`:
`perfect-round` and `group-guru`, whose complete-round / complete-group sweep a
rescore can break, and the final-standing `completionist`/`podium`/`wooden-spoon`
gated on a decided final): these reflect a standing that is only true while its gate holds,
not a lifetime peak, so when their metric no longer meets any tier the row is deleted
(`applyAchievementTier`) and the badge self-heals away - a mis-grant, or an undone
state like a rewound tournament whose final is no longer decided. "You called it"
feats stay high-water even though they hinge on a decided result: `grand-finale` and
`champion-oracle`/`underdog-whisperer`/`golden-touch` are kept, not revoked, exactly
as one earned-then-corrected exact call is. Revocation is silent (no notification).
`evaluateAchievements` also sweeps revocable rows for users who have dropped out of
the stats map entirely (a reset that wiped all their predictions), which the per-user
loop would otherwise never revisit.

**The final-standing gate.** completionist, podium and wooden-spoon settle only once
the tournament is over - gated on `hasDecidedFinal` (`server/utils/awards/service.ts`),
the same decided-FINAL check the trophies use. Without it, completionist fired
mid-tournament off "every match scored so far" (not every match), and last-place would
flip every finalize tick. **opening-act** grades the EXACT on the earliest-kickoff
scored match (the tournament opener); it is single-GOLD (high rarity). **underdog** is
a winning champion pick ranked outside the FIFA top 15 (rank >= 16, or unranked) - a
reachable long shot, not the old effectively-impossible rank 41+. **grand-finale** is
the counterpart to opening-act: the EXACT on a `stage = 'FINAL'` match (also single-GOLD).

**Scoreline-flavour badges** grade off the settled prediction alone: **bore-draw** is
an EXACT 0-0, **goal-rush** an EXACT on a match of 5+ total goals, and **nemesis** the
most EXACT calls landed on any one team (counted for both the home and away side of
each exact pick; single-tier at 3). nemesis is the internal catalog key; it displays
as **"Open Book"** (the key is kept so already-granted rows survive). **Flawless (`perfect-round`)** excludes the final
and third-place (`isSingleMatchStage`): those are one-match rounds where a "perfect
round" is just a single exact (already grand-finale's job), so Flawless means a clean
sweep of a real multi-match round. Both Flawless and set-and-forget only count a
**complete** round - every one of its matches scored (`completeRounds`: `roundScored`
=== the round's total match count). Without this a knockout round with just its first
match scored would read as perfect off that one exact, before the rest are played.
**set-and-forget** rewards predicting every match of such a complete multi-match round
and never editing one - "never edited" = the pick has a single `prediction_commitment`
ledger entry (the chain appends only on a real change).

**Correct-outcome badges** grade off calling the RESULT, not the exact scoreline -
`baseTier` in `{EXACT, DIFF, OUTCOME}` (i.e. non-MISS). **Form Reader (`form-reader`)**
counts distinct teams the user called the outcome of at least `OUTCOMES_PER_TEAM` (5)
times, a team counted for both the home and away side of each of its matches (same
tally shape as nemesis); graded at 3/5/7 teams. Since a team needs five games to give
five outcomes it leans on deep-run sides, so gold is a brutal read of the bracket.
**Champion's Path (`champions-path`)** grades on the champion's whole run - the champion
is the winner of the decided, scored `stage='FINAL'` match, its whole scored-match set
the denominator. The `championPath` metric is 1 (**gold**) when every one of those
matches is covered by a non-MISS pick, 2 (**diamond**) when every one is EXACT; a
missing pick or one MISS drops it to 0. High-water like the other "you called it" feats
(non-revocable). **Group Guru (`group-guru`)** is tiered by the **number** of complete
groups (`match.group_name`, every match scored - the group analog of Flawless's
`completeRounds` guard) whose every outcome the user called: `groupPerfect` returns that
count, graded 1/2/3 for bronze/silver/gold. Revocable, so a rescore that breaks a sweep
self-heals - and because it is now both tiered and revocable, `applyAchievementTier`
**demotes** the tier (not just deletes at zero) when the count drops a band.

**wooden-spoon** ("dead last") judges only players who saw the tournament through:
you must have predicted at least `WOODEN_SPOON_MIN_SHARE` (half) of its matches to be
eligible, and the worst rank is taken among those eligible players (not all
participants), so an early quitter ranked below the genuine last-placer is neither
awarded the spoon nor able to void it. It also needs more than one eligible player
(a real contest). Because getLeaderboard scans the whole `user` table, this
participant-scoping is what keeps "last" from meaning "one of the untold many who never
played".

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

**Pick-time badges grant at save, not just at finalize.** early-bird, night-owl and
deadline-dancer are earned by the ACT of saving a pick (createdAt vs kickoff), fully
known before any match is scored - so waiting for a scored finalize tick meant a
deadline pick showed locked until its match finished (the cabinet only marks a badge
earned when a persisted row exists). `upsertPrediction` (`server/utils/predictions/service.ts`)
now calls `evaluatePickTimeAchievements` after a first save (never on an edit -
createdAt is immutable), which recounts just those three metrics for that user and
grants/notifies immediately. The finalize batch stays as the backfill; grants are
idempotent so it never re-notifies. The shared grant/upgrade step is
`applyAchievementTier`.

### The secret badges

`the-magic-word` is hidden and GLOBAL (spans competitions, null `competitionId`). It
is not batch-evaluated: it is granted from the better-auth user-update hook
(`lib/auth.ts`) when the konami skin unlock persists (`skinsUnlocked`), via
`grantAchievement` (idempotent, notifies once).

`the-collector` is also hidden and GLOBAL, but evaluated rather than event-granted:
`evaluateAchievements` grants it (idempotent) once a user holds every *collectable*
badge (`heldCount === COLLECTABLE_ACHIEVEMENTS.length` - the 20 non-secret,
non-SHAME badges). The two SHAME badges are deliberately excluded (`isCollectable`):
they conflict with the good badges (in a real-sized field, dead last is nowhere near
top-3), so counting them would make the collector unwinnable in one competition. Both secrets are kept out of the public docs
like the rest of the [easter eggs](easter-eggs.md); the copy is deliberately cryptic
so the unlock is not dangled as a to-do list.

## Cabinet and showcase

- Read: `GET /api/users/[id]/cabinet?competition=` -> `getCabinet`
  (`server/utils/achievements/cabinet.ts`) returns a `CabinetDto` (trophies,
  achievements with earned/locked status, showcase, isOwner). It mirrors the profile
  privacy gate (private profiles 404 unless owner/admin/league mate). A hidden badge
  surfaces only once earned, so a locked secret is never revealed.
- Each metric badge in the DTO also carries a live `current` value (the read side of
  `computeAchievementStats`, recomputed on cabinet read - not persisted, since
  `evaluateAchievements` only stores `progress` once a tier is reached). It powers the
  `CabinetTile` progress bar toward the next tier, drawn on locked badges too. Hidden
  badges are dropped before the DTO, so their `current` never leaks; event-granted
  secrets have no metric, so `current` is null. SHAME badges also get `current: null`
  (you don't chase a cold streak, and a bar would telegraph its threshold).
- Streak badges (hot-streak, on-fire) also carry `currentStreak`: the ongoing run
  right now, shown next to the best (which rides `current`). It is null on non-streak
  badges, once the badge is maxed (top tier reached - nothing left to chase), and when
  the current run is 0 (a just-broken streak is nothing to show). The
  cur* runs come from `computeAchievementStats` (the trailing counters of `streaks()`).
- The DTO also carries the per-key `icon` override (or null to fall back to the
  category icon), resolved from `catalog.ts` so `TrophyCabinet.vue` need not know keys.
- Write: `PUT /api/showcase` -> `setShowcase` replaces the owner's showcase with an
  ordered set of pins (max `SHOWCASE_SLOT_COUNT` = 3, no duplicates, achievements
  only, each one earned). Trophies cannot be pinned.
- Client: `useCabinet` / `useShowcase` composables, `TrophyCabinet.vue` +
  `CabinetTile.vue`, embedded on the profile page (competition scope only).

**Rarity.** `getCabinet` also attaches a per-tier `rarity` to every `AchievementDto`:
one competition-wide grouped scan of `user_achievement` (`GROUP BY key, tier`) gives
holder counts, divided by the participant denominator (`stats.size` - the participant
map `computeAchievementStats` already returns, one entry per player with a prediction).
`rarity[]` is cumulative and ascending: each tier's `pct` is the share of participants
holding the badge at that tier **or higher**. The tile shows the rarity of the tier you
hold, or (locked) the lowest tier's share; `pct === 0` renders as "no one has this yet".
GLOBAL badges (held app-wide, so a per-competition denominator is meaningless) and SHAME
badges (no chasing a punishment) carry no rarity - `rarityFor` returns `[]` for both.

## Notifications

New winners/unlocks fire `TROPHY_AWARDED` / `ACHIEVEMENT_UNLOCKED`
(see [notifications](notifications.md) and [web-push](web-push.md), `tournament`
push category). The bell resolves the trophy/badge NAME via the `achievements.*`
i18n keys; push reads the same locale JSON server-side. Deep link = the recipient's
own cabinet (`cabinetPath`). The cabinet `<section>` anchors at `#cabinet`; the
"My achievements" account-menu entry and the notification deep link both target it,
and the profile page smooth-scrolls to it when it arrives with that hash (the
router's own hash scroll fires before the section mounts and ignores its
`scroll-margin-top`, so a `watch` re-runs `scrollIntoView` once the section exists).
That page also auto-scrolls to the "now" boundary (end of the played picks) when it
loads with no hash; a single latch arbitrates so the two never both fire. The intended
hash is read as `route.hash || window.location.hash`: on an in-app nav `route.hash`
leads (the URL reconciles a tick late), mid-hydration the URL leads - trusting both
orderings stops the jump-to-now branch from claiming the one-shot on a stale-empty hash
before the `#cabinet` anchor resolves.

## Sources

- `db/app-schema.ts` (`competition_award`, `user_achievement`, `showcase_pin`)
- `server/utils/awards/service.ts`, `server/utils/achievements/{catalog,service,cabinet,backfill}.ts`
- `server/tasks/matches/finalize.ts` (the award + evaluate + notify hook),
  `server/tasks/achievements/backfill.ts` (manual historical backfill, listed in `server/utils/tasks/registry.ts`)
- `server/api/users/[id]/cabinet.get.ts`, `server/api/showcase/index.put.ts`
- `app/composables/use{Cabinet,Showcase}.ts`, `app/components/{TrophyCabinet,CabinetTile}.vue`
- `shared/types/achievements.ts`, i18n `achievements.*` in all five locales
- Notifications: `shared/types/notifications.ts`, `server/utils/notifications/events.ts`
