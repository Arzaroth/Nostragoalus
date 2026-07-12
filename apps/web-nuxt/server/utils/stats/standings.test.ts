import { describe, it, expect } from 'vitest'
import { computeAllGroupStandings, computeGroupStandings, type StandingsInputMatch } from './standings'

function m(
  home: string,
  away: string,
  status: string,
  fh: number | null = null,
  fa: number | null = null,
): StandingsInputMatch {
  return { homeTeam: home, awayTeam: away, homeTeamCode: home, awayTeamCode: away, status, fullTimeHome: fh, fullTimeAway: fa }
}

describe('computeGroupStandings', () => {
  it('ranks by points, then goal difference, then goals for', () => {
    const table = computeGroupStandings([
      m('A', 'B', 'FINISHED', 2, 0),
      m('C', 'D', 'FINISHED', 1, 1),
      m('A', 'C', 'FINISHED', 1, 0),
      m('B', 'D', 'SCHEDULED'),
    ])
    // A: 6pts gd+3 ; D: 1pt gd0 ; C: 1pt gd-1 ; B: 0pts
    expect(table.map((r) => r.name)).toEqual(['A', 'D', 'C', 'B'])
    expect(table[0]).toMatchObject({ name: 'A', played: 2, won: 2, points: 6, gf: 3, ga: 0, gd: 3 })
    expect(table.find((r) => r.name === 'B')).toMatchObject({ played: 1, lost: 1, points: 0, gd: -2 })
  })

  it('includes teams that have not played yet', () => {
    const table = computeGroupStandings([m('A', 'B', 'SCHEDULED')])
    expect(table).toHaveLength(2)
    expect(table[0].played).toBe(0)
  })

  it('credits the away team on an away win', () => {
    const table = computeGroupStandings([m('A', 'B', 'FINISHED', 0, 2)])
    expect(table[0]).toMatchObject({ name: 'B', won: 1, lost: 0, points: 3, gd: 2 })
    expect(table.find((r) => r.name === 'A')).toMatchObject({ won: 0, lost: 1, points: 0, gd: -2 })
  })

  it('ignores in-progress matches by default but counts them with includeLive', () => {
    const live = [m('A', 'B', 'LIVE', 2, 1)]
    expect(computeGroupStandings(live)[0].played).toBe(0)
    const prov = computeGroupStandings(live, { includeLive: true })
    expect(prov[0]).toMatchObject({ name: 'A', played: 1, won: 1, points: 3, gd: 1 })
  })

  it('breaks ties on goals-for then name', () => {
    // X and Y both 3pts, gd +1, but X scored more.
    const byGf = computeGroupStandings([m('X', 'Z', 'FINISHED', 3, 2), m('Y', 'W', 'FINISHED', 1, 0)])
    expect(byGf.slice(0, 2).map((r) => r.name)).toEqual(['X', 'Y'])
    // A and B both 1pt, gd 0, gf 1 → alphabetical.
    const byName = computeGroupStandings([m('B', 'A', 'FINISHED', 1, 1)])
    expect(byName.map((r) => r.name)).toEqual(['A', 'B'])
  })
})

function gm(group: string | null, home: string, away: string, fh: number | null = null, fa: number | null = null) {
  return { ...m(home, away, fh == null ? 'SCHEDULED' : 'FINISHED', fh, fa), group }
}

describe('computeAllGroupStandings', () => {
  it('splits matches by group, in letter order, each its own table', () => {
    const groups = computeAllGroupStandings([
      gm('B', 'C', 'D', 0, 0),
      gm('A', 'X', 'Y', 2, 0),
      gm('A', 'X', 'Z', 1, 0),
    ])
    expect(groups.map((g) => g.group)).toEqual(['A', 'B'])
    const a = groups[0]
    // X wins both; Y (-2) and Z (-1) both 0pts, so Z edges Y on goal difference.
    expect(a.rows.map((r) => r.name)).toEqual(['X', 'Z', 'Y'])
    expect(a.rows[0]).toMatchObject({ name: 'X', played: 2, won: 2, points: 6, gd: 3 })
    // Group B's draw is isolated - it never bleeds into A's table.
    expect(groups[1].rows.every((r) => r.points <= 1)).toBe(true)
  })

  it('drops matches with no group, so a knockout-only set yields nothing', () => {
    expect(computeAllGroupStandings([gm(null, 'A', 'B', 1, 0)])).toEqual([])
  })

  it('passes includeLive through to each group table', () => {
    const live = [{ ...m('A', 'B', 'LIVE', 1, 0), group: 'A' }]
    expect(computeAllGroupStandings(live)[0].rows[0].played).toBe(0)
    expect(computeAllGroupStandings(live, { includeLive: true })[0].rows[0]).toMatchObject({ name: 'A', played: 1, points: 3 })
  })
})
