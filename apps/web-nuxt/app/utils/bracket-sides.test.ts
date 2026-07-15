import { describe, expect, it } from 'vitest'
import type { BracketMatch, BracketRound } from '#shared/types/match'
import { splitBracketSides } from './bracket-sides'

function match(n: number): BracketMatch {
  return {
    providerMatchId: String(n),
    matchNumber: n,
    homeTeam: 'Home',
    homeCode: 'HOM',
    awayTeam: 'Away',
    awayCode: 'AWY',
    homeScore: null,
    awayScore: null,
    homePens: null,
    awayPens: null,
    winner: null,
    status: 'SCHEDULED',
    kickoffTime: '2026-07-19T19:00:00Z',
  }
}

function round(name: string, sequence: number, count: number): BracketRound {
  return { name, sequence, matches: Array.from({ length: count }, (_, i) => match(sequence * 100 + i)) }
}

// The names FIFA's seasonbracket feed actually emits for the 2026 World Cup.
const FIFA_ROUNDS = [
  round('Round of 32', 2, 16),
  round('Round of 16', 3, 8),
  round('Quarter-final', 4, 4),
  round('Semi-final', 5, 2),
  round('Bronze final', 6, 1),
  round('Final', 7, 1),
]

describe('splitBracketSides', () => {
  it('puts a "Bronze final" third-place tie in the centre, not in the side columns', () => {
    const sides = splitBracketSides(FIFA_ROUNDS)!

    expect(sides.third?.name).toBe('Bronze final')
    expect(sides.final?.name).toBe('Final')
    // The regression: the third-place round leaking into the split rendered it
    // as an extra left column plus an empty right one, pushing the final off
    // the semis' midline.
    expect(sides.left.map((r) => r.name)).toEqual(['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final'])
    expect(sides.right.map((r) => r.name)).toEqual(['Semi-final', 'Quarter-final', 'Round of 16', 'Round of 32'])
    expect([...sides.left, ...sides.right].filter((r) => r.matches.length === 0)).toEqual([])
  })

  it('splits each side round in half and mirrors the right side', () => {
    const sides = splitBracketSides(FIFA_ROUNDS)!

    expect(sides.left.map((r) => r.matches.length)).toEqual([8, 4, 2, 1])
    expect(sides.right.map((r) => r.matches.length)).toEqual([1, 2, 4, 8])
    // The halves partition the round: no match is dropped or shown twice.
    const r32 = FIFA_ROUNDS[0]!
    expect([...sides.left[0]!.matches, ...sides.right[3]!.matches]).toEqual(r32.matches)
  })

  it('recognises the third-place round under its other provider spellings', () => {
    for (const name of ['Third-place play-off', 'Third place', '3rd place final']) {
      const rounds = [round('Semi-final', 5, 2), round(name, 6, 1), round('Final', 7, 1)]
      expect(splitBracketSides(rounds)!.third?.name).toBe(name)
    }
  })

  it('keeps the sides symmetric when the competition has no third-place play-off', () => {
    const rounds = [round('Semi-final', 5, 2), round('Final', 7, 1)]
    const sides = splitBracketSides(rounds)!

    expect(sides.third).toBeNull()
    expect(sides.final?.name).toBe('Final')
    expect(sides.left.map((r) => r.matches.length)).toEqual([1])
    expect(sides.right.map((r) => r.matches.length)).toEqual([1])
  })

  it('does not mistake UEFA\'s "Final tournament" group stage for the final', () => {
    const rounds = [round('Final tournament', 1, 4), round('Semi-final', 5, 2), round('Final', 7, 1)]
    const sides = splitBracketSides(rounds)!

    expect(sides.final?.name).toBe('Final')
    expect(sides.left.map((r) => r.name)).toEqual(['Final tournament', 'Semi-final'])
  })

  it('orders the side columns by sequence regardless of the order they arrive in', () => {
    const shuffled = [FIFA_ROUNDS[3]!, FIFA_ROUNDS[5]!, FIFA_ROUNDS[0]!, FIFA_ROUNDS[4]!, FIFA_ROUNDS[2]!, FIFA_ROUNDS[1]!]
    expect(splitBracketSides(shuffled)!.left.map((r) => r.name)).toEqual(['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final'])
  })

  it('keeps every round in the split when the feed carries no final yet', () => {
    const sides = splitBracketSides([round('Round of 16', 3, 8), round('Quarter-final', 4, 4)])!

    expect(sides.final).toBeNull()
    expect(sides.third).toBeNull()
    expect(sides.left.map((r) => r.matches.length)).toEqual([4, 2])
    expect(sides.right.map((r) => r.matches.length)).toEqual([2, 4])
  })

  it('returns null when there is no bracket', () => {
    expect(splitBracketSides([])).toBeNull()
  })
})
