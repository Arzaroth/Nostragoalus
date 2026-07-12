# Pick guard

Two small safeguards around making a score prediction, both on the fixtures page
([apps/web-nuxt/app/pages/[competition]/matches/index.vue](../../apps/web-nuxt/app/pages/%5Bcompetition%5D/matches/index.vue))
and its score field ([apps/web-nuxt/app/components/ScoreInput.vue](../../apps/web-nuxt/app/components/ScoreInput.vue)).
Part of the core predict loop: see [predictions-and-scoring.md](predictions-and-scoring.md).

## Outstanding-picks nudge

Above the pick cards, a banner shows "N matches need a pick before the next
lockout" whenever N > 0, with a "Jump to first" button. N counts fixtures that
are still **pickable** (kickoff ahead so not locked, both teams known) and that
the user has not predicted yet. The logic is a pure helper so it lands under the
98% coverage gate (the page itself is not covered):

- [apps/web-nuxt/app/utils/outstanding-picks.ts](../../apps/web-nuxt/app/utils/outstanding-picks.ts):
  `isMatchPickable` mirrors ScoreInput's own disabled rule
  (`!isLocked && homeTeamCode && awayTeamCode`), so the count never disagrees
  with the rows the user can actually fill in. `countOutstandingPicks` and
  `firstOutstandingPickId` take the kickoff-ordered matches list plus a set of
  already-predicted match ids.

Both are derived on the page from the `useMatches` / `useMyPredictions` data
already loaded, so the nudge adds no extra request. The soonest unpicked match may
be hidden by the active view, the filters, or a collapsed round, so "Jump to
first" switches to the fixtures view, reveals the upcoming bucket, clears the
country filter, and expands the target's round before scrolling via the shared
`scrollToMatch` helper - the same one the first-upcoming auto-scroll uses. It also
claims that one-shot auto-scroll so switching back to fixtures does not fight the
jump for the scroll position.

## Outlandish-score confirm

The score field auto-saves on debounce / blur / Enter with no Save button. When
the entered scoreline is implausible, it holds a confirm dialog
([AppConfirmDialog.vue](../../apps/web-nuxt/app/components/AppConfirmDialog.vue)) before
committing instead of saving silently. It is a confirm, not a block: accept saves
the value, cancel (or Esc / mask) restores the last saved value. Plausible scores
still auto-save untouched, and the keyboard-advance UX is preserved - focus does
not hop to the next match while the confirm is up.

- Predicate: [apps/web-nuxt/app/utils/prediction-sanity.ts](../../apps/web-nuxt/app/utils/prediction-sanity.ts)
  `isOutlandishScore(home, away)` - an absolute cap: `home > 7 || away > 7 ||
  home + away > 11`.

The threshold is a flat ceiling on purpose, not a sigma / z-score model: goal
counts are low-count and Poisson-ish, so a variance-based bound miscalibrates.
See [decisions.md](../decisions.md).

## i18n

`matches.outstanding.{label,jump}` (label is pluralized) and
`predictions.outlandish.{title,body,confirm}` in all five locales.
