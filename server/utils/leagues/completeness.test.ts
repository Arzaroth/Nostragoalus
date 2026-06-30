import { describe, it, expect } from 'vitest'
import {
  isFullyComplete,
  pickCompleteness,
  summarizeCompleteness,
  type CompletenessPick,
  type PickStatus,
} from './completeness'

function p(over: Partial<CompletenessPick> = {}): CompletenessPick {
  return { isOutcomeOnly: false, wager: null, ...over }
}

describe('pickCompleteness', () => {
  it('is MISSING with no pick', () => {
    expect(pickCompleteness(null, 'NORMAL')).toEqual({ state: 'MISSING', reason: 'NEEDS_PICK' })
    expect(pickCompleteness(undefined, 'EASY')).toEqual({ state: 'MISSING', reason: 'NEEDS_PICK' })
  })

  it('is INCOMPLETE for an outcome-only pick in a NORMAL league', () => {
    expect(pickCompleteness(p({ isOutcomeOnly: true }), 'NORMAL')).toEqual({ state: 'INCOMPLETE', reason: 'NEEDS_EXACT' })
  })

  it('is COMPLETE for an exact pick in a NORMAL league', () => {
    expect(pickCompleteness(p(), 'NORMAL')).toEqual({ state: 'COMPLETE', reason: null })
  })

  it('accepts an outcome-only pick in EASY and HARDCORE leagues', () => {
    expect(pickCompleteness(p({ isOutcomeOnly: true }), 'EASY')).toEqual({ state: 'COMPLETE', reason: null })
    expect(pickCompleteness(p({ isOutcomeOnly: true }), 'HARDCORE')).toEqual({ state: 'COMPLETE', reason: null })
  })

  it('needs a stake in a HARD league', () => {
    expect(pickCompleteness(p({ wager: null }), 'HARD')).toEqual({ state: 'INCOMPLETE', reason: 'NEEDS_STAKE' })
    expect(pickCompleteness(p({ wager: 0 }), 'HARD')).toEqual({ state: 'INCOMPLETE', reason: 'NEEDS_STAKE' })
  })

  it('is COMPLETE for a staked HARD pick (exact is optional)', () => {
    expect(pickCompleteness(p({ wager: 4 }), 'HARD')).toEqual({ state: 'COMPLETE', reason: null })
    expect(pickCompleteness(p({ wager: 4, isOutcomeOnly: true }), 'HARD')).toEqual({ state: 'COMPLETE', reason: null })
  })
})

describe('summarizeCompleteness', () => {
  it('counts states and reasons', () => {
    const statuses: PickStatus[] = [
      { state: 'COMPLETE', reason: null },
      { state: 'COMPLETE', reason: null },
      { state: 'INCOMPLETE', reason: 'NEEDS_EXACT' },
      { state: 'INCOMPLETE', reason: 'NEEDS_STAKE' },
      { state: 'MISSING', reason: 'NEEDS_PICK' },
    ]
    expect(summarizeCompleteness(statuses)).toEqual({
      total: 5,
      complete: 2,
      incomplete: 2,
      missing: 1,
      needsExact: 1,
      needsStake: 1,
    })
  })

  it('handles an empty set', () => {
    expect(summarizeCompleteness([])).toEqual({
      total: 0,
      complete: 0,
      incomplete: 0,
      missing: 0,
      needsExact: 0,
      needsStake: 0,
    })
  })
})

describe('isFullyComplete', () => {
  it('is true only when every pick is complete and there is at least one', () => {
    expect(isFullyComplete(summarizeCompleteness([{ state: 'COMPLETE', reason: null }]))).toBe(true)
    expect(isFullyComplete(summarizeCompleteness([]))).toBe(false)
    expect(
      isFullyComplete(summarizeCompleteness([{ state: 'MISSING', reason: 'NEEDS_PICK' }])),
    ).toBe(false)
  })
})
