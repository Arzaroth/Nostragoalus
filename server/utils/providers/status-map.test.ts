import { describe, it, expect } from 'vitest'
import {
  mapApiFootballRound,
  mapApiFootballStatus,
  mapFootballDataStage,
  mapFootballDataStatus,
  parseFootballDataGroup,
} from './status-map'

describe('mapFootballDataStatus', () => {
  it.each([
    ['SCHEDULED', 'SCHEDULED'],
    ['TIMED', 'SCHEDULED'],
    ['IN_PLAY', 'LIVE'],
    ['PAUSED', 'PAUSED'],
    ['FINISHED', 'FINISHED'],
    ['SUSPENDED', 'SUSPENDED'],
    ['POSTPONED', 'POSTPONED'],
    ['CANCELLED', 'CANCELLED'],
    ['AWARDED', 'AWARDED'],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapFootballDataStatus(input)).toBe(expected)
  })

  it('defaults unknown statuses to SCHEDULED', () => {
    expect(mapFootballDataStatus('WHATEVER')).toBe('SCHEDULED')
  })
})

describe('mapFootballDataStage', () => {
  it.each([
    ['GROUP_STAGE', 'GROUP'],
    ['LAST_32', 'R32'],
    ['LAST_16', 'R16'],
    ['QUARTER_FINALS', 'QF'],
    ['SEMI_FINALS', 'SF'],
    ['THIRD_PLACE', 'THIRD_PLACE'],
    ['FINAL', 'FINAL'],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapFootballDataStage(input)).toBe(expected)
  })

  it('defaults unknown stages to GROUP', () => {
    expect(mapFootballDataStage('PRELIMINARY')).toBe('GROUP')
  })
})

describe('parseFootballDataGroup', () => {
  it('extracts the group letter', () => {
    expect(parseFootballDataGroup('GROUP_A')).toBe('A')
    expect(parseFootballDataGroup('GROUP_L')).toBe('L')
  })
  it('returns null for empty input', () => {
    expect(parseFootballDataGroup(null)).toBeNull()
    expect(parseFootballDataGroup(undefined)).toBeNull()
  })
  it('returns null when there is no trailing letter', () => {
    expect(parseFootballDataGroup('KNOCKOUT')).toBeNull()
  })
})

describe('mapApiFootballStatus', () => {
  it.each([
    ['NS', 'SCHEDULED'],
    ['1H', 'LIVE'],
    ['HT', 'PAUSED'],
    ['FT', 'FINISHED'],
    ['AET', 'FINISHED'],
    ['PEN', 'FINISHED'],
    ['SUSP', 'SUSPENDED'],
    ['PST', 'POSTPONED'],
    ['CANC', 'CANCELLED'],
    ['AWD', 'AWARDED'],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapApiFootballStatus(input)).toBe(expected)
  })

  it('defaults unknown statuses to SCHEDULED', () => {
    expect(mapApiFootballStatus('???')).toBe('SCHEDULED')
  })
})

describe('mapApiFootballRound', () => {
  it('parses a group with a matchday', () => {
    expect(mapApiFootballRound('Group A - 2')).toEqual({ stage: 'GROUP', group: 'A', matchday: 2 })
  })
  it('parses a group without a matchday', () => {
    expect(mapApiFootballRound('Group C')).toEqual({ stage: 'GROUP', group: 'C', matchday: null })
  })
  it.each([
    ['Round of 32', 'R32'],
    ['Round of 16', 'R16'],
    ['Quarter-finals', 'QF'],
    ['Semi-finals', 'SF'],
    ['3rd Place Final', 'THIRD_PLACE'],
    ['Final', 'FINAL'],
  ])('parses %s -> %s', (round, stage) => {
    expect(mapApiFootballRound(round).stage).toBe(stage)
  })
  it('defaults unknown rounds to GROUP', () => {
    expect(mapApiFootballRound('Preliminary')).toEqual({ stage: 'GROUP', group: null, matchday: null })
  })
})
