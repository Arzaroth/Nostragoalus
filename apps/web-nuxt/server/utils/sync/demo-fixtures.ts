import type { NormalizedMatch } from '../../../shared/types/match'

function fixture(
  id: string,
  group: string,
  home: [string, string],
  away: [string, string],
  kickoffTime: string,
): NormalizedMatch {
  return {
    providerMatchId: id,
    stage: 'GROUP',
    group,
    matchday: 1,
    homeTeam: { name: home[0], code: home[1] },
    awayTeam: { name: away[0], code: away[1] },
    kickoffTime,
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null } },
    winner: null,
  }
}

export const DEMO_FIXTURES: NormalizedMatch[] = [
  fixture('demo-1', 'A', ['Mexico', 'MEX'], ['Canada', 'CAN'], '2026-06-15T18:00:00Z'),
  fixture('demo-2', 'A', ['USA', 'USA'], ['Brazil', 'BRA'], '2026-06-15T21:00:00Z'),
  fixture('demo-3', 'B', ['France', 'FRA'], ['Argentina', 'ARG'], '2026-06-16T18:00:00Z'),
  fixture('demo-4', 'B', ['England', 'ENG'], ['Spain', 'ESP'], '2026-06-16T21:00:00Z'),
]
