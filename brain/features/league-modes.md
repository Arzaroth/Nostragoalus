# League modes

A league's **mode** decides how it scores. The default `NORMAL` is the classic
exact-score game ([predictions & scoring](predictions-and-scoring.md)); three
new modes change the rules per league. Set at creation, a mode is **frozen once
the competition has kicked off** so the game cannot shift under players
mid-tournament. Source of truth: `server/utils/leagues/modes.ts`.

This makes a league more than the member-filter lens of plain [leagues](leagues.md):
a moded league is re-scored from picks at read time and can hold its own picks.

## The four modes (`league_mode` enum)

| Mode | Pick needed | Scoring | Board |
|---|---|---|---|
| `NORMAL` | exact score | the canonical engine (tiers + crowd/odds bonus + champion + best-scorer + live) | standard leaderboard |
| `EASY` | outcome (W/D/L) | correct outcome pays a flat base + the odds tier of that result (longshots pay more); wrong pays 0 | points board |
| `HARD` | score + a confidence stake | correct outcome pays your stake, the exact score pays it twice; wrong pays 0; no odds/joker layer | points board |
| `HARDCORE` | outcome | last-man-standing: a wrong/missing outcome burns a life, zero lives = eliminated; survivors are co-winners | survival board |

Mode predicates (`isOutcomeMode`, `usesWager`, `usesLives`, `isEliminationMode`),
the per-mode pure scorers (`easyPoints`, `hardPoints`, `normalPoints`,
`modePoints`, `hardcoreSurvives`), the canonical W/D/L scoreline map, and the
fixed `hardRoundBudget` all live in `server/utils/leagues/modes.ts`.

- **EASY** reads only the outcome of a pick, so an exact 2-1 and a W/D/L "home"
  score it identically. Points use the competition's configured `oddsTiers`
  (`server/utils/scoring/bonus.ts:oddsBonus`) on top of `EASY_CORRECT_BASE`.
- **HARD** layers a per-round confidence budget (`hardRoundBudget` = matches in
  round x `HARD_BUDGET_PER_MATCH`). The stake rides the base pick (shared across
  a member's HARD leagues), enforced in `upsertPrediction`.
- **HARDCORE** carries no points. The board walks scored matches in kickoff order
  (`server/utils/leaderboard/modes.ts:buildSurvivalBoard`), burning a life per
  wrong/missing outcome; `league.lives` (owner-set, 1-99) is the buffer.

## Base pick + per-league override

Predictions stay **(user, match)**-centric ([leagues](leagues.md) explains why):
one base pick per user per competition, in `prediction`. Modes do not change
that. To let a player play one league safe and another for the upset, a moded
league can hold an **override**:

- `league_prediction` is an optional per-(league, user, match) row. The
  **effective pick** for a moded board is `override ?? base`.
- Writing an override (`upsertLeaguePrediction`) flips that membership off sync
  (`league_member.picks_synced = false`). `setLeaguePicksSynced` toggles it back,
  dropping overrides on not-yet-kicked-off matches (locked ones stay so past
  scores never change).
- Overrides are **gated to moded leagues** (`upsertLeaguePrediction` rejects
  NORMAL): a NORMAL re-score cannot reproduce the global crowd-rarity bonus +
  champion/best-scorer/live the engine bakes into stored totals. So two NORMAL
  leagues always share the base pick. See [decisions](../decisions.md) and
  `TODO.md` for the deferred full divergence.

## Completeness (the nudge)

Because picks can diverge and modes want different things, completeness is
per-(user, match, league): `server/utils/leagues/completeness.ts` +
`getLeagueCompleteness`. Strict rules:

- `MISSING` - no effective pick.
- `INCOMPLETE` - NORMAL got an outcome-only pick (needs a real score), or HARD has
  no stake yet.
- `COMPLETE` - otherwise. EASY/HARDCORE accept any outcome.

An outcome-only pick is flagged by `prediction.is_outcome_only` (set when the
W/D/L quick-pick stores a canonical scoreline).

## Boards

`server/utils/leaderboard/modes.ts:getLeagueModeBoard` serves moded boards,
re-scoring effective picks for the visible members (same visibility rules as the
normal board). It is **self-contained**: no champion/best-scorer/crowd/live, and
no rank snapshots (moded leagues rank live, so they have no movement arrows -
`updateLeagueRankSnapshots` skips them). NORMAL leagues keep the standard
`getLeaderboard` path.

- Endpoint: `GET /api/leagues/[id]/mode-board` (member/admin gated, 400 for
  NORMAL). Client: `useLeagueModeBoard`, rendered by `LeagueModePointsBoard.vue`
  / `LeagueSurvivalBoard.vue` on `pages/leagues/[id].vue`.

## Create / swap / guard

- `createLeague` + `setLeagueMode` carry `mode` + `lives`; `normalizeLives`
  validates HARDCORE (1-99, null elsewhere).
- `assertCompetitionNotRunning` (earliest `match.kickoff_time < now`) blocks a
  moded create and any mode swap once the competition is running -> HTTP 409.
- Routes: `POST /api/leagues`, `PUT /api/leagues/[id]` (owner-only mode swap),
  detail GET returns `mode`/`lives`. Client: `LeagueCreateDialog.vue` mode
  selector + lives input, `LeagueModeBadge.vue`.

## Key tables / files

- Schema: `league.mode`, `league.lives`, `league_member.picks_synced`,
  `prediction.is_outcome_only`, `prediction.wager`, `league_prediction`
  (`db/app-schema.ts`).
- Server: `server/utils/leagues/modes.ts`, `completeness.ts`,
  `server/utils/leaderboard/modes.ts`, override functions in
  `server/utils/predictions/service.ts`.

## Deferred (see `TODO.md`)

The client divergence UI (W/D/L quick-pick, per-league override editor + sync
toggle, completeness nudge chips) and the HARD in-grid stake input are not built
yet; the server supports all of it. Also deferred: NORMAL-league override
scoring, champion/live in moded boards, moded movement arrows, exact HARD
effective-budget, tamper-evidence over overrides, admin moded-create.
