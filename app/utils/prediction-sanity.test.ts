import { describe, it, expect } from 'vitest'
import { isOutlandishScore } from './prediction-sanity'

describe('isOutlandishScore', () => {
  it('passes typical and goalless scorelines', () => {
    expect(isOutlandishScore(0, 0)).toBe(false)
    expect(isOutlandishScore(3, 2)).toBe(false)
    expect(isOutlandishScore(1, 0)).toBe(false)
  })

  it('treats 7 as the last plausible single-side total, 8 as outlandish', () => {
    expect(isOutlandishScore(7, 0)).toBe(false)
    expect(isOutlandishScore(0, 7)).toBe(false)
    expect(isOutlandishScore(8, 0)).toBe(true)
    expect(isOutlandishScore(0, 8)).toBe(true)
  })

  it('treats an aggregate of 11 as plausible, 12 as outlandish', () => {
    expect(isOutlandishScore(7, 4)).toBe(false) // total 11
    expect(isOutlandishScore(7, 5)).toBe(true) // total 12
    expect(isOutlandishScore(6, 6)).toBe(true) // total 12, neither side over 7
  })

  it('flags the 1-33 fat-finger case', () => {
    expect(isOutlandishScore(1, 33)).toBe(true)
    expect(isOutlandishScore(33, 1)).toBe(true)
  })
})
