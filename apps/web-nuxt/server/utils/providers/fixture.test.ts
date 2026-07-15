import { describe, expect, it } from 'vitest'
import { fixtureBracket, fixtureProvider } from './fixture'
import { orderBracketFeeders } from './bracket-order'

describe('fixtureProvider', () => {
  it('exposes a bracket and nothing else', async () => {
    const p = fixtureProvider()
    expect(p.meta.name).toBe('fixture')
    expect(await p.getBracket!()).toEqual(fixtureBracket())
    expect(await p.listFixtures({ season: '2026' })).toEqual([])
    expect(await p.getMatchesByDate('2026-07-01')).toEqual([])
    expect(await p.getLiveMatches()).toEqual([])
  })
})

describe('fixtureBracket', () => {
  it('is a fully decided 8-team tree ending on the seeded winner', () => {
    const b = fixtureBracket()
    expect(b.rounds.map(r => [r.name, r.matches.length])).toEqual([
      ['Quarter-final', 4],
      ['Semi-final', 2],
      ['Play-off for third place', 1],
      ['Final', 1],
    ])
    const all = b.rounds.flatMap(r => r.matches)
    expect(all.every(m => m.winner && m.status === 'FINISHED')).toBe(true)
    expect(all.every(m => m.homeCode && m.awayCode)).toBe(true)
    // The champion must be the side the final's own score picks out.
    const final = b.rounds.at(-1)!.matches[0]!
    expect(final.winner === 'HOME' ? final.homeCode : final.awayCode).toBe(b.winner!.code)
  })

  it('names the sides of each tie so every winner feeds its parent', () => {
    const b = fixtureBracket()
    const winnerOf = (m: { winner: string | null; homeCode: string | null; awayCode: string | null }) =>
      m.winner === 'HOME' ? m.homeCode : m.awayCode
    const qfWinners = b.rounds[0]!.matches.map(winnerOf)
    const sfTeams = b.rounds[1]!.matches.flatMap(m => [m.homeCode, m.awayCode])
    expect([...sfTeams].sort()).toEqual([...qfWinners].sort())

    const sfWinners = b.rounds[1]!.matches.map(winnerOf)
    const finalM = b.rounds[3]!.matches[0]!
    expect([finalM.homeCode, finalM.awayCode].sort()).toEqual([...sfWinners].sort())

    // The bronze tie is contested by the two semi-final losers.
    const sfLosers = b.rounds[1]!.matches.map(m => (m.winner === 'HOME' ? m.awayCode : m.homeCode))
    const third = b.rounds[2]!.matches[0]!
    expect([third.homeCode, third.awayCode].sort()).toEqual([...sfLosers].sort())
  })

  it('survives feeder ordering unchanged (every side is already official)', () => {
    expect(orderBracketFeeders(fixtureBracket())).toEqual(fixtureBracket())
  })
})
