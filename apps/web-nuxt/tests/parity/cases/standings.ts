// Vectors for group-standings computation (points/GD/GF, FIFA tiebreak order).
import type { StandingsInputMatch } from '../../../server/utils/stats/standings'

interface RawCase {
  fn: string
  args: unknown[]
}

function m(homeTeam: string, awayTeam: string, fh: number | null, fa: number | null, status = 'FINISHED'): StandingsInputMatch {
  return { homeTeam, awayTeam, homeTeamCode: null, awayTeamCode: null, status, fullTimeHome: fh, fullTimeAway: fa }
}

// A four-team group: A beats B and D, draws C; C beats D; B beats D.
const group: StandingsInputMatch[] = [
  m('A', 'B', 2, 0),
  m('A', 'C', 1, 1),
  m('A', 'D', 3, 1),
  m('C', 'D', 2, 0),
  m('B', 'D', 1, 0),
  m('B', 'C', 0, 0),
]

export async function buildCases(): Promise<RawCase[]> {
  return [
    { fn: 'computeGroupStandings', args: [group] },
    // an unplayed match still lists both teams at 0
    { fn: 'computeGroupStandings', args: [[m('X', 'Y', null, null, 'SCHEDULED')]] },
    // live scoreline counts when includeLive is set
    { fn: 'computeGroupStandings', args: [[m('A', 'B', 1, 0, 'LIVE')], { includeLive: true }] },
    { fn: 'computeGroupStandings', args: [[]] },
  ]
}
