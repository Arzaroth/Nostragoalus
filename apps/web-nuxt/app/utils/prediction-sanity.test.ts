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

  it('does not call an ordinary rugby scoreline outlandish', () => {
    // The football ceiling is one converted try, so it warned on every realistic
    // rugby pick: 21-17 could not be saved without confirming past a dialog.
    expect(isOutlandishScore(21, 17, 'RUGBY_UNION')).toBe(false)
    expect(isOutlandishScore(27, 13, 'RUGBY_UNION')).toBe(false)
    // The real record books have to fit too - Ireland 82-8 Romania, RWC 2023.
    expect(isOutlandishScore(82, 8, 'RUGBY_UNION')).toBe(false)
    expect(isOutlandishScore(96, 0, 'RUGBY_UNION')).toBe(false)
  })

  it('still catches the digit too many in rugby', () => {
    expect(isOutlandishScore(211, 17, 'RUGBY_UNION')).toBe(true)
    expect(isOutlandishScore(21, 177, 'RUGBY_UNION')).toBe(true)
    expect(isOutlandishScore(90, 80, 'RUGBY_UNION')).toBe(true)
  })

  it('keeps the football ceiling for football, and for an unknown sport', () => {
    expect(isOutlandishScore(21, 17, 'FOOTBALL')).toBe(true)
    expect(isOutlandishScore(21, 17, null)).toBe(true)
    expect(isOutlandishScore(21, 17, 'CURLING')).toBe(true)
  })
})
