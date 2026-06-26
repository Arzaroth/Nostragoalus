import { describe, it, expect } from 'vitest'
import { compareByCriteria, computeGroupStandings, type StandingsInputMatch, type StandingRow } from './standings'
import { tiebreakersForCompetition } from './tiebreakers'

function fm(home: string, away: string, hg: number, ag: number): StandingsInputMatch {
  return { homeTeam: home, awayTeam: away, homeTeamCode: home, awayTeamCode: away, status: 'FINISHED', fullTimeHome: hg, fullTimeAway: ag }
}
const order = (rows: StandingRow[]) => rows.map((r) => r.name)
const wc26 = tiebreakersForCompetition('world-cup-2026').withinGroup
const wc22 = tiebreakersForCompetition('world-cup-2022').withinGroup

describe('per-competition group tiebreakers', () => {
  // A and B finish level on 6 points: A won their head-to-head, but B has the
  // better overall goal difference. The two competitions must order them opposite.
  const tied = [
    fm('A', 'B', 1, 0),
    fm('C', 'A', 2, 0),
    fm('A', 'D', 2, 0),
    fm('B', 'C', 1, 0),
    fm('B', 'D', 5, 0),
    fm('D', 'C', 1, 0),
  ]

  it('WC2026 ranks the head-to-head winner above the better goal difference', () => {
    const o = order(computeGroupStandings(tied, { tiebreakers: wc26 }))
    expect(o.indexOf('A')).toBeLessThan(o.indexOf('B'))
  })

  it('WC2022 ranks the better goal difference above the head-to-head winner', () => {
    const o = order(computeGroupStandings(tied, { tiebreakers: wc22 }))
    expect(o.indexOf('B')).toBeLessThan(o.indexOf('A'))
  })

  it('defaults to goal-difference-first when no competition is given', () => {
    const o = order(computeGroupStandings(tied))
    expect(o.indexOf('B')).toBeLessThan(o.indexOf('A'))
  })

  // A>B, B>C, C>A cycle: head-to-head points are equal among the three, so the
  // head-to-head goal difference (computed among only those three) decides.
  it('breaks a three-way head-to-head cycle by the mini-table goal difference (WC2026)', () => {
    const cyc = [
      fm('A', 'B', 2, 0),
      fm('B', 'C', 1, 0),
      fm('C', 'A', 1, 0),
      fm('A', 'D', 1, 0),
      fm('B', 'D', 1, 0),
      fm('C', 'D', 1, 0),
    ]
    const o = order(computeGroupStandings(cyc, { tiebreakers: wc26 }))
    // h2h GD among {A,B,C}: A +1, C 0, B -1
    expect(o.slice(0, 3)).toEqual(['A', 'C', 'B'])
    expect(o[3]).toBe('D')
  })

  it('breaks a three-way head-to-head tie on goals scored when points and GD are level (WC2026)', () => {
    // A, B, C all drew each other (h2h points + h2h GD all level) and all beat D,
    // so only head-to-head goals-for separates them: A 3, C 3, B 2 -> B is last.
    const draws = [
      fm('A', 'B', 1, 1),
      fm('B', 'C', 1, 1),
      fm('C', 'A', 2, 2),
      fm('A', 'D', 1, 0),
      fm('B', 'D', 1, 0),
      fm('C', 'D', 1, 0),
    ]
    const o = order(computeGroupStandings(draws, { tiebreakers: wc26 }))
    expect(o.slice(0, 3)).toEqual(['A', 'C', 'B'])
  })

  it('ranks a head-to-head winner that won away (WC2026)', () => {
    // B beat A in their head-to-head (an away win); they finish level on 6 points,
    // A with the better overall GD - WC2026 still puts B (the H2H winner) above A.
    const awayH2H = [
      fm('A', 'B', 0, 1),
      fm('A', 'C', 3, 0),
      fm('A', 'D', 3, 0),
      fm('B', 'C', 1, 0),
      fm('D', 'B', 1, 0),
      fm('C', 'D', 1, 0),
    ]
    const o = order(computeGroupStandings(awayH2H, { tiebreakers: wc26 }))
    expect(o.indexOf('B')).toBeLessThan(o.indexOf('A'))
  })

  it('uses the default rules for an unknown or missing competition', () => {
    expect(tiebreakersForCompetition(null).withinGroup).toEqual(['points', 'gd', 'gf'])
    expect(tiebreakersForCompetition('nope').bestThirds).toBe(0)
  })

  it('counts a live match at its current score when includeLive is set', () => {
    const live: StandingsInputMatch[] = [
      { homeTeam: 'A', awayTeam: 'B', homeTeamCode: 'A', awayTeamCode: 'B', status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0 },
    ]
    expect(order(computeGroupStandings(live, { includeLive: true }))[0]).toBe('A')
  })

  it('treats a head-to-head criterion as neutral in the overall comparator', () => {
    const r = (name: string): StandingRow => ({ code: null, name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 })
    expect(compareByCriteria(['h2h-points'])(r('a'), r('b'))).toBe(0)
  })

  it('compareByCriteria applies the best-third list, including number of wins', () => {
    const base: StandingRow = { code: null, name: '', played: 3, won: 0, drawn: 0, lost: 0, gf: 3, ga: 3, gd: 0, points: 3 }
    const more: StandingRow = { ...base, name: 'more', won: 3 }
    const fewer: StandingRow = { ...base, name: 'fewer', won: 1 }
    // Euro's best-third list includes 'wins' (after points/gd/gf), so 'more' ranks first.
    const euroThird = tiebreakersForCompetition('euro-2024').bestThird
    expect([more, fewer].sort(compareByCriteria(euroThird))).toEqual([more, fewer])
    expect([fewer, more].sort(compareByCriteria(euroThird))).toEqual([more, fewer])
    // WC2026's best-third list has no 'wins', so the two are equal (stable order kept).
    const wcThird = tiebreakersForCompetition('world-cup-2026').bestThird
    expect([fewer, more].sort(compareByCriteria(wcThird))).toEqual([fewer, more])
  })
})
