import { describe, it, expect } from 'vitest'
import { countsDouble, isKnockout, isSingleMatchStage } from './match'

describe('stage helpers', () => {
  it('isSingleMatchStage: final and third place only', () => {
    expect(isSingleMatchStage('FINAL')).toBe(true)
    expect(isSingleMatchStage('THIRD_PLACE')).toBe(true)
    expect(isSingleMatchStage('SF')).toBe(false)
    expect(isSingleMatchStage('GROUP')).toBe(false)
    expect(isSingleMatchStage(null)).toBe(false)
  })
  it('countsDouble: the final only', () => {
    expect(countsDouble('FINAL')).toBe(true)
    expect(countsDouble('THIRD_PLACE')).toBe(false)
    expect(countsDouble('SF')).toBe(false)
    expect(countsDouble(undefined)).toBe(false)
  })
  it('isKnockout: anything but the group stage', () => {
    expect(isKnockout('R16')).toBe(true)
    expect(isKnockout('FINAL')).toBe(true)
    expect(isKnockout('GROUP')).toBe(false)
    expect(isKnockout(null)).toBe(false)
  })
})
