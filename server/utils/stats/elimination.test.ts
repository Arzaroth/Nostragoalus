import { describe, it, expect } from 'vitest'
import { computeEliminatedTeams, type ElimMatch } from './elimination'

function gm(group: string, home: string, away: string, hg: number, ag: number): ElimMatch {
  return { stage: 'GROUP', group, homeTeamCode: home, awayTeamCode: away, status: 'FINISHED', fullTimeHome: hg, fullTimeAway: ag, winner: null }
}
function sched(group: string, home: string, away: string): ElimMatch {
  return { stage: 'GROUP', group, homeTeamCode: home, awayTeamCode: away, status: 'SCHEDULED', fullTimeHome: null, fullTimeAway: null, winner: null }
}
function ko(stage: string, home: string, away: string, winner: 'HOME' | 'AWAY' | 'DRAW' | null, status = 'FINISHED'): ElimMatch {
  return { stage, group: null, homeTeamCode: home, awayTeamCode: away, status, fullTimeHome: 1, fullTimeAway: 0, winner }
}
const set = (m: ElimMatch[], slug: string) => new Set(computeEliminatedTeams(m, slug))

describe('computeEliminatedTeams - knockout', () => {
  it('eliminates a knockout loser but spares a semi-final loser', () => {
    const out = set([ko('QF', 'FRA', 'BRA', 'HOME'), ko('SF', 'ARG', 'ESP', 'HOME')], 'world-cup-2026')
    expect(out.has('BRA')).toBe(true) // QF loser
    expect(out.has('ESP')).toBe(false) // SF loser -> third-place game
  })

  it('eliminates the third-place and final losers', () => {
    const out = set([ko('THIRD_PLACE', 'NED', 'POR', 'HOME'), ko('FINAL', 'ARG', 'FRA', 'AWAY')], 'world-cup-2026')
    expect(out.has('POR')).toBe(true)
    expect(out.has('ARG')).toBe(true)
  })
})

describe('computeEliminatedTeams - mid-group brute force', () => {
  // D loses all three group games (0 pts, no games left); A, B, C each beat D so
  // all three are guaranteed above D - D is certainly last.
  const lostAll = [
    gm('A', 'A1', 'D1', 1, 0),
    gm('A', 'B1', 'D1', 1, 0),
    gm('A', 'C1', 'D1', 1, 0),
    sched('A', 'A1', 'B1'),
    sched('A', 'A1', 'C1'),
    sched('A', 'B1', 'C1'),
  ]
  it('greys a team that is certainly last in its group (WC2026, 3rd may still go up)', () => {
    const out = set(lostAll, 'world-cup-2026')
    expect(out.has('D1')).toBe(true)
    expect(out.has('A1')).toBe(false)
    expect(out.has('B1')).toBe(false)
    expect(out.has('C1')).toBe(false)
  })

  // A and B have 6 pts (done vs C, D); C and D have 0 with only each other left.
  // WC2022 (top-2 only): both C and D can't reach top-2 -> eliminated.
  // WC2026 (best thirds): the C-D winner can be 3rd -> neither is certainly out.
  const twoClear = [
    gm('A', 'A1', 'C1', 1, 0),
    gm('A', 'A1', 'D1', 1, 0),
    gm('A', 'B1', 'C1', 1, 0),
    gm('A', 'B1', 'D1', 1, 0),
    sched('A', 'A1', 'B1'),
    sched('A', 'C1', 'D1'),
  ]
  it('WC2022 greys teams that cannot reach the top two', () => {
    const out = set(twoClear, 'world-cup-2022')
    expect(out.has('C1')).toBe(true)
    expect(out.has('D1')).toBe(true)
    expect(out.has('A1')).toBe(false)
    expect(out.has('B1')).toBe(false)
  })
  it('WC2026 does NOT grey them, since a third can still advance', () => {
    expect(set(twoClear, 'world-cup-2026').size).toBe(0)
  })

  it('greys nothing while every team can still reach the top two (WC2022)', () => {
    const open = [gm('A', 'A1', 'B1', 1, 0), sched('A', 'C1', 'D1'), sched('A', 'A1', 'C1'), sched('A', 'B1', 'D1')]
    expect(set(open, 'world-cup-2022').size).toBe(0)
  })
})

describe('computeEliminatedTeams - edge cases', () => {
  it('ignores draws, cancelled, scoreless-finished, and undecided knockout matches', () => {
    const matches: ElimMatch[] = [
      gm('A', 'A1', 'B1', 1, 1), // a draw
      { ...sched('A', 'C1', 'D1'), status: 'CANCELLED' }, // skipped
      { ...gm('A', 'A1', 'C1', 0, 0), fullTimeHome: null, fullTimeAway: null }, // finished, no score -> skipped
      ko('QF', 'LIVEX', 'LIVEY', null, 'LIVE'), // knockout not finished
      ko('QF', 'DRAWP', 'DRAWQ', 'DRAW'), // knockout drawn (no decided loser)
      sched('A', 'B1', 'D1'),
      sched('A', 'A1', 'D1'),
      sched('A', 'B1', 'C1'),
    ]
    const out = set(matches, 'world-cup-2026')
    for (const c of ['LIVEX', 'LIVEY', 'DRAWP', 'DRAWQ']) expect(out.has(c)).toBe(false)
    expect(out.size).toBe(0)
  })

  it('counts an away win in the group base points', () => {
    // D1 (the away side each time) wins all three, so the base-points away-win path
    // is exercised; the other three can still reach the top three, so none are out.
    const away = [
      gm('A', 'A1', 'D1', 0, 3),
      gm('A', 'B1', 'D1', 0, 3),
      gm('A', 'C1', 'D1', 0, 3),
      sched('A', 'A1', 'B1'),
      sched('A', 'A1', 'C1'),
      sched('A', 'B1', 'C1'),
    ]
    expect(computeEliminatedTeams(away, 'world-cup-2026')).toEqual([])
  })

  it('claims no mid-group elimination when a group has an absurd number of remaining games', () => {
    const many: ElimMatch[] = [gm('A', 'A1', 'C1', 5, 0)]
    for (let i = 0; i < 9; i++) many.push(sched('A', 'A1', 'B1'))
    expect(computeEliminatedTeams(many, 'world-cup-2026')).toEqual([])
  })
})

describe('computeEliminatedTeams - cross-group non-qualifiers', () => {
  it('greys a group team absent from the knockout once the groups are over', () => {
    const matches = [
      gm('A', 'FRA', 'AUS', 2, 0),
      gm('A', 'DEN', 'FRA', 1, 0),
      gm('A', 'DEN', 'AUS', 1, 0),
      gm('A', 'FRA', 'DEN', 1, 0),
      gm('A', 'AUS', 'DEN', 1, 0),
      gm('A', 'AUS', 'FRA', 1, 0),
      ko('R32', 'FRA', 'DEN', 'HOME'), // FRA and DEN advanced; AUS did not
    ]
    const out = set(matches, 'world-cup-2026')
    expect(out.has('AUS')).toBe(true)
  })
})
