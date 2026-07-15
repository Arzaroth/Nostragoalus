import { describe, expect, it } from 'vitest'
import { mapStageFromName, parseGroupLetter } from './stage'

describe('mapStageFromName', () => {
  it('maps each provider stage name to its app stage', () => {
    expect(mapStageFromName('Group F')).toBe('GROUP')
    expect(mapStageFromName('Round of 32')).toBe('R32')
    expect(mapStageFromName('Round of 16')).toBe('R16')
    expect(mapStageFromName('Quarter-finals')).toBe('QF')
    expect(mapStageFromName('Semi-finals')).toBe('SF')
    expect(mapStageFromName('Third-place play-off')).toBe('THIRD_PLACE')
    expect(mapStageFromName('Final')).toBe('FINAL')
  })

  it('keeps the names that contain "final" off FINAL', () => {
    expect(mapStageFromName('Final Tournament')).toBe('GROUP')
    expect(mapStageFromName('Bronze final')).toBe('THIRD_PLACE')
    expect(mapStageFromName('3rd place final')).toBe('THIRD_PLACE')
  })

  it('falls back to GROUP on an unknown or missing name', () => {
    expect(mapStageFromName('Friendly')).toBe('GROUP')
    expect(mapStageFromName(null)).toBe('GROUP')
    expect(mapStageFromName(undefined)).toBe('GROUP')
  })
})

describe('parseGroupLetter', () => {
  it('reads the trailing group letter, else null', () => {
    expect(parseGroupLetter('Group F')).toBe('F')
    expect(parseGroupLetter('group a')).toBe('A')
    expect(parseGroupLetter('Group M')).toBeNull()
    expect(parseGroupLetter(null)).toBeNull()
  })
})
