import type { LeagueMode } from './modes'

export type CompletenessState = 'COMPLETE' | 'INCOMPLETE' | 'MISSING'

// Why a pick is not yet complete, so the UI can show the right nudge.
//  NEEDS_PICK  - no effective pick at all.
//  NEEDS_EXACT - an outcome-only pick in a NORMAL league (you said "HOME", not a
//                scoreline).
//  NEEDS_STAKE - a HARD pick with no confidence stake yet.
export type IncompleteReason = 'NEEDS_PICK' | 'NEEDS_EXACT' | 'NEEDS_STAKE'

export interface PickStatus {
  state: CompletenessState
  reason: IncompleteReason | null
}

// The minimal effective-pick shape completeness cares about.
export interface CompletenessPick {
  isOutcomeOnly: boolean
  wager: number | null
}

// Strict completeness of one effective pick against a league's mode:
//  - NORMAL wants a real exact score, so an outcome-only pick is INCOMPLETE.
//  - HARD wants a confidence stake (the exact score is optional upside).
//  - EASY/HARDCORE only want an outcome, so any pick satisfies them.
export function pickCompleteness(pick: CompletenessPick | null | undefined, mode: LeagueMode): PickStatus {
  if (!pick) return { state: 'MISSING', reason: 'NEEDS_PICK' }
  if (mode === 'NORMAL' && pick.isOutcomeOnly) return { state: 'INCOMPLETE', reason: 'NEEDS_EXACT' }
  if (mode === 'HARD' && (pick.wager == null || pick.wager <= 0)) return { state: 'INCOMPLETE', reason: 'NEEDS_STAKE' }
  return { state: 'COMPLETE', reason: null }
}

export interface CompletenessSummary {
  total: number
  complete: number
  incomplete: number
  missing: number
  needsExact: number
  needsStake: number
}

export function summarizeCompleteness(statuses: PickStatus[]): CompletenessSummary {
  const summary: CompletenessSummary = {
    total: statuses.length,
    complete: 0,
    incomplete: 0,
    missing: 0,
    needsExact: 0,
    needsStake: 0,
  }
  for (const s of statuses) {
    if (s.state === 'COMPLETE') summary.complete += 1
    else if (s.state === 'MISSING') summary.missing += 1
    else summary.incomplete += 1
    if (s.reason === 'NEEDS_EXACT') summary.needsExact += 1
    if (s.reason === 'NEEDS_STAKE') summary.needsStake += 1
  }
  return summary
}

export function isFullyComplete(summary: CompletenessSummary): boolean {
  return summary.total > 0 && summary.complete === summary.total
}
