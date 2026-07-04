# Past-pick counterfactual

"An earlier pick of yours nailed it." When a user has changed their score
prediction for a match before kickoff, this replays their OWN earlier
(swapped-off) picks through the scoring engine and, once the match is under way,
surfaces the best one when it would have out-scored the pick they kept.

Builds on [predictions-and-scoring.md](predictions-and-scoring.md) (the engine),
[tamper-evidence.md](tamper-evidence.md) (the ledger the history comes from) and
the live/provisional per-match scoring in
[../architecture/realtime.md](../architecture/realtime.md).

## Where the history comes from

Every real score-pick change appends a row to `prediction_commitment`
(see [tamper-evidence.md](tamper-evidence.md)). The live `prediction` row holds
only the CURRENT pick; the ledger holds every score the user ever committed for
the match, with the opening (homeGoals/awayGoals/salt) in the clear. This feature
reads the OWNER's own ledger rows directly - the salt/reveal gate is about the
*public* chain endpoint, not an owner reading their own picks - and still gates
the whole thing on kickoff so nothing leaks early.

## How it scores

`getPastPickCounterfactual(db, { matchId, userId, rules? })` in
[`server/utils/past-pick/service.ts`](../../server/utils/past-pick/service.ts):

1. Load the match. Pre-kickoff (`!matchHasStarted`) or no scoreline yet -> `none`.
2. Load the kept pick (the user's current `prediction` row). None -> `none`.
3. Read the user's ledger rows for the match; keep the **distinct** scorelines
   that differ from the kept pick (A->B->A leaves one "B"; the kept score is
   never its own alternative). No candidates -> `none`.
4. Score against the actual result - the **live** scoreline while
   `matchIsInPlay` (provisional), else the final - with the SAME engine the
   per-match standings use: `scorePredictions` over the whole locked field for
   the kept pick, and `scoreSyntheticPrediction` (outside the crowd-rarity
   denominator, like the [crowd bot](crowd-bot.md)) for each earlier pick. The
   crowd histogram is always the full field; odds and joker are handled exactly
   as finalize does (`countsDouble` forces the final's ×2).
5. Suppress if the kept pick is itself `EXACT`, or if no earlier pick strictly
   out-scores it (covers "the only earlier hit duplicates the kept pick").
6. Otherwise return the best earlier pick (highest points, scoreline tiebreak),
   the kept pick's score, `scope` (`live` | `final`), and `cheeky` (the winning
   earlier pick is 0-0 - the comedy line).

The earlier picks are scored synthetically against the field as it locked rather
than swapping the kept pick out of the histogram for the earlier one - a small,
documented approximation (see [../../TODO.md](../../TODO.md)).

## Surface

- Endpoint:
  [`server/api/matches/[id]/my-past-picks.get.ts`](../../server/api/matches/[id]/my-past-picks.get.ts)
  - owner-gated (`requireUser`), returns the counterfactual for the session user
  only. **Copy-protection**: never another user's picks.
- Composable: [`app/composables/useMyPastPicks.ts`](../../app/composables/useMyPastPicks.ts)
  - client-only, enabled once the match has started.
- Component: `PastPickHint.vue` on the match page
  (`app/pages/[competition]/matches/[id].vue`), under "your pick", owner-only.
  While live it is provisional and refetches on the page's live score signal
  (`scoreTotal`), resolving to the full-time line at the whistle. Copy in
  `pastPick.*` across all five locales.

## Phase / future

Phase 1 = full-time result AND the live tease, both shipped together in v2.5.0.
The plan
is to fold this into one "counterfactuals" surface with the future "evil twin"
and "what-if stats" items - tracked in [../../TODO.md](../../TODO.md).

## Sources

- `server/utils/past-pick/service.ts` (+ `service.test.ts`)
- `server/api/matches/[id]/my-past-picks.get.ts`
- `app/composables/useMyPastPicks.ts`, `app/components/PastPickHint.vue` (+ `.nuxt.test.ts`)
- `shared/types/past-pick.ts`
- Reused: `server/utils/scoring/engine.ts`, `server/utils/scoring/store.ts`, `server/utils/commitment/service.ts`, `shared/types/match.ts`
