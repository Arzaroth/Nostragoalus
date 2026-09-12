import { describe, it, expect } from 'vitest'
import type { AppStage, NormalizedMatch } from '../../../shared/types/match'
import { summarizeFixtures } from './probe'

function fixture(over: Partial<NormalizedMatch> & { stage: AppStage }): NormalizedMatch {
  return {
    providerMatchId: `m-${Math.random().toString(36).slice(2)}`,
    group: null,
    matchday: null,
    homeTeam: { id: 'h', name: 'Home', code: 'HOM' },
    awayTeam: { id: 'a', name: 'Away', code: 'AWY' },
    kickoffTime: '2026-06-11T16:00:00Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, penalties: null },
    winner: null,
    ...over,
  } as NormalizedMatch
}

describe('summarizeFixtures', () => {
  it('accepts a group-and-knockout cup: every fixture lands, no blockers', () => {
    const probe = summarizeFixtures(
      [
        fixture({ stage: 'GROUP', group: 'A', matchday: 1 }),
        fixture({ stage: 'GROUP', group: 'A', matchday: 2 }),
        fixture({ stage: 'GROUP', group: 'B', matchday: 1 }),
        fixture({ stage: 'R16' }),
        fixture({ stage: 'FINAL', homeTeam: { id: 'x', name: 'X', code: 'X' } }),
      ],
      true,
    )
    expect(probe).toMatchObject({ fixtures: 5, ingestible: 5, dropped: 0, supported: true, blockers: [] })
    expect(probe.groups).toEqual(['A', 'B'])
    expect(probe.hasBracket).toBe(true)
  })

  // The failure this whole feature exists to surface: a domestic league's
  // fixtures are all GROUP with no letter, so no matchday can be derived and
  // every one of them is skipped at insert without an error anywhere.
  it('rejects a competition whose group fixtures carry no matchday', () => {
    const probe = summarizeFixtures(
      [fixture({ stage: 'GROUP' }), fixture({ stage: 'GROUP' }), fixture({ stage: 'GROUP' })],
      false,
    )
    expect(probe).toMatchObject({ fixtures: 3, ingestible: 0, dropped: 3, supported: false })
    expect(probe.blockers).toContain('fixtures_dropped')
  })

  // Partial loss is worse than total loss: the competition looks like it works.
  it('rejects a partially ingestible season rather than accepting the majority', () => {
    const probe = summarizeFixtures(
      [fixture({ stage: 'GROUP', group: 'A', matchday: 1 }), fixture({ stage: 'GROUP' })],
      false,
    )
    expect(probe).toMatchObject({ ingestible: 1, dropped: 1, supported: false })
    expect(probe.blockers).toEqual(['fixtures_dropped'])
  })

  it('rejects a two-legged knockout, naming the stages', () => {
    const legs = (stage: AppStage) => [
      fixture({ stage, homeTeam: { id: '1', name: 'Ajax', code: 'AJA' }, awayTeam: { id: '2', name: 'Roma', code: 'ROM' } }),
      // Same tie, reversed - a home-and-away pair, not two different ties.
      fixture({ stage, homeTeam: { id: '2', name: 'Roma', code: 'ROM' }, awayTeam: { id: '1', name: 'Ajax', code: 'AJA' } }),
    ]
    const probe = summarizeFixtures([...legs('R16'), ...legs('QF')], true)
    expect(probe.twoLeggedStages.sort()).toEqual(['QF', 'R16'])
    expect(probe.blockers).toContain('two_legged_knockout')
    expect(probe.supported).toBe(false)
  })

  it('does not read two different ties at one stage as two legs', () => {
    const probe = summarizeFixtures(
      [
        fixture({ stage: 'SF', homeTeam: { id: '1', name: 'Ajax', code: 'AJA' }, awayTeam: { id: '2', name: 'Roma', code: 'ROM' } }),
        fixture({ stage: 'SF', homeTeam: { id: '3', name: 'Lyon', code: 'LYO' }, awayTeam: { id: '4', name: 'Porto', code: 'POR' } }),
      ],
      true,
    )
    expect(probe.twoLeggedStages).toEqual([])
    expect(probe.supported).toBe(true)
  })

  it('reports an empty season as unsupported rather than as a clean sheet', () => {
    const probe = summarizeFixtures([], false)
    expect(probe).toMatchObject({ fixtures: 0, ingestible: 0, dropped: 0, supported: false })
    expect(probe.blockers).toEqual(['no_fixtures'])
  })
})
