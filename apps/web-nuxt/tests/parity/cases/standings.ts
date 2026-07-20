// Vectors for group-standings computation (points/GD/GF, FIFA tiebreak order).
import type { StandingsInputMatch } from '../../../server/utils/stats/standings'
import type { Criterion } from '../../../server/utils/stats/tiebreakers'

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

const H2H_FIRST: Criterion[] = ['points', 'h2h-points', 'h2h-gd', 'h2h-gf', 'gd', 'gf']
const GD_FIRST: Criterion[] = ['points', 'gd', 'gf', 'h2h-points', 'h2h-gd', 'h2h-gf']

// A and B level on 6 points: A won the head-to-head, B has the better overall GD,
// so H2H_FIRST and GD_FIRST must order them opposite ways.
const tied: StandingsInputMatch[] = [
  m('A', 'B', 1, 0),
  m('C', 'A', 2, 0),
  m('A', 'D', 2, 0),
  m('B', 'C', 1, 0),
  m('B', 'D', 5, 0),
  m('D', 'C', 1, 0),
]

// A>B, B>C, C>A: head-to-head points level among the three, the mini-table GD decides.
const cycle: StandingsInputMatch[] = [
  m('A', 'B', 2, 0),
  m('B', 'C', 1, 0),
  m('C', 'A', 1, 0),
  m('A', 'D', 1, 0),
  m('B', 'D', 1, 0),
  m('C', 'D', 1, 0),
]

// A, B and C drew each other (h2h points AND h2h GD level), so only head-to-head
// goals-for separates them.
const allDrawn: StandingsInputMatch[] = [
  m('A', 'B', 1, 1),
  m('B', 'C', 1, 1),
  m('C', 'A', 2, 2),
  m('A', 'D', 1, 0),
  m('B', 'D', 1, 0),
  m('C', 'D', 1, 0),
]

// A perfect 1-0 cycle: the whole head-to-head block separates nobody, so ranking
// falls through to the overall criteria after it.
const perfectCycle: StandingsInputMatch[] = [
  m('A', 'B', 1, 0),
  m('B', 'C', 1, 0),
  m('C', 'A', 1, 0),
  m('A', 'D', 2, 0),
  m('B', 'D', 3, 1),
  m('C', 'D', 1, 0),
]

// Two teams identical on every criterion and never opponents: the ladder is
// exhausted and the terminal name sort decides. The accented name is the point -
// it orders differently under localeCompare than under a code-point compare, so
// this vector pins which one both stacks use.
const nameTie: StandingsInputMatch[] = [
  m("Côte d'Ivoire", 'Zambia', 1, 0),
  m('Croatia', 'Nigeria', 1, 0),
  m('Türkiye', 'Tunisia', 2, 0),
  m('Tanzania', 'Togo', 2, 0),
]

export async function buildCases(): Promise<RawCase[]> {
  return [
    { fn: 'computeGroupStandings', args: [group] },
    // an unplayed match still lists both teams at 0
    { fn: 'computeGroupStandings', args: [[m('X', 'Y', null, null, 'SCHEDULED')]] },
    // live scoreline counts when includeLive is set
    { fn: 'computeGroupStandings', args: [[m('A', 'B', 1, 0, 'LIVE')], { includeLive: true }] },
    { fn: 'computeGroupStandings', args: [[]] },
    // head-to-head block: winner above the better overall GD, and the reverse
    { fn: 'computeGroupStandings', args: [tied, { tiebreakers: H2H_FIRST }] },
    { fn: 'computeGroupStandings', args: [tied, { tiebreakers: GD_FIRST }] },
    // three-way cycle broken by the mini-table GD, then by mini-table goals-for
    { fn: 'computeGroupStandings', args: [cycle, { tiebreakers: H2H_FIRST }] },
    { fn: 'computeGroupStandings', args: [allDrawn, { tiebreakers: H2H_FIRST }] },
    // block separates nobody -> fall through to the overall criteria
    { fn: 'computeGroupStandings', args: [perfectCycle, { tiebreakers: H2H_FIRST }] },
    // head-to-head over a live/paused match, with the mutual match unplayed
    {
      fn: 'computeGroupStandings',
      args: [
        [m('A', 'C', 1, 0, 'PAUSED'), m('B', 'C', 1, 0), m('A', 'B', null, null, 'SCHEDULED')],
        { includeLive: true, tiebreakers: H2H_FIRST },
      ],
    },
    // criteria exhausted -> terminal name sort
    { fn: 'computeGroupStandings', args: [nameTie] },
    { fn: 'computeGroupStandings', args: [nameTie, { tiebreakers: H2H_FIRST }] },
  ]
}
