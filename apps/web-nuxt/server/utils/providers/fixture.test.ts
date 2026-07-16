import { describe, expect, it } from 'vitest'
import { fixtureBracket, fixtureProvider } from './fixture'
import { orderBracketFeeders } from './bracket-order'
import { roundLabelKey } from '#shared/share-card'

describe('fixtureProvider', () => {
  it('serves the bracket and no fixtures of its own', async () => {
    const p = fixtureProvider()
    expect(p.meta.name).toBe('fixture')
    expect((await p.getBracket!())!.rounds).toHaveLength(4)
    expect(await p.listFixtures({ season: '2026' })).toEqual([])
    expect(await p.getMatchesByDate('2026-07-01')).toEqual([])
    expect(await p.getLiveMatches()).toEqual([])
  })
})

describe('fixtureBracket', () => {
  it('is an 8-team tree played out up to a still-scheduled final', () => {
    const b = fixtureBracket()
    const all = b.rounds.flatMap(r => r.matches)
    const final = b.rounds.at(-1)!.matches[0]!

    expect(all.filter(m => m.winner === null)).toEqual([final])
    expect(all.filter(m => m.status !== 'FINISHED')).toEqual([final])
    expect(final.status).toBe('SCHEDULED')
    expect(final.homeScore).toBeNull()
    // Both finalists are official (their semis are decided), so the final is a
    // real undecided card rather than a projected one.
    expect([final.homeCode, final.awayCode]).toEqual(['ARG', 'FRA'])
    // 4.2.5: no champion until the final is played.
    expect(b.winner).toBeNull()
  })

  it('names its rounds the way the live feed does, third place included', () => {
    // "Bronze final" is the feed's own spelling and the one 4.2.5 taught the app
    // to read; the ladder must resolve it to third place, not to the final.
    expect(fixtureBracket().rounds.map(r => roundLabelKey(r.name))).toEqual([
      'bracket.round.qf',
      'bracket.round.sf',
      'bracket.round.third',
      'bracket.round.final',
    ])
  })

  it('sends every winner into the tie it feeds', () => {
    const b = fixtureBracket()
    const winnerOf = (m: { winner: string | null; homeCode: string | null; awayCode: string | null }) =>
      m.winner === 'HOME' ? m.homeCode : m.awayCode
    const qfWinners = b.rounds[0]!.matches.map(winnerOf)
    const sfTeams = b.rounds[1]!.matches.flatMap(m => [m.homeCode, m.awayCode])
    expect([...sfTeams].sort()).toEqual([...qfWinners].sort())

    const sfWinners = b.rounds[1]!.matches.map(winnerOf)
    const final = b.rounds[3]!.matches[0]!
    expect([final.homeCode, final.awayCode].sort()).toEqual([...sfWinners].sort())

    // The bronze tie is contested by the two semi-final losers.
    const sfLosers = b.rounds[1]!.matches.map(m => (m.winner === 'HOME' ? m.awayCode : m.homeCode))
    const third = b.rounds[2]!.matches[0]!
    expect([third.homeCode, third.awayCode].sort()).toEqual([...sfLosers].sort())
  })

  it('survives feeder ordering unchanged (every side is already official)', () => {
    expect(orderBracketFeeders(fixtureBracket())).toEqual(fixtureBracket())
  })
})
