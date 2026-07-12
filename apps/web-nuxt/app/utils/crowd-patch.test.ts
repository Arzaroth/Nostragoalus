import { describe, it, expect } from 'vitest'
import { crowdPatchScope } from './crowd-patch'

const totals = { home: 1, away: 0, count: 1 }

describe('crowdPatchScope', () => {
  it('routes plain messages to global and league messages to the selected league', () => {
    expect(crowdPatchScope({ type: 'crowd:update', matchId: 'm1', totals }, null)).toBe('global')
    expect(crowdPatchScope({ type: 'crowd:update', matchId: 'm1', totals }, 'l1')).toBe('global')
    expect(crowdPatchScope({ type: 'crowd:league-update', matchId: 'm1', leagueId: 'l1', totals }, 'l1')).toBe('league')
  })

  it('drops messages for other leagues or with no selection', () => {
    expect(crowdPatchScope({ type: 'crowd:league-update', matchId: 'm1', leagueId: 'l2', totals }, 'l1')).toBeNull()
    expect(crowdPatchScope({ type: 'crowd:league-update', matchId: 'm1', leagueId: 'l1', totals }, null)).toBeNull()
  })

  it('drops malformed messages', () => {
    expect(crowdPatchScope({ type: 'match:update', matchId: 'm1', totals }, null)).toBeNull()
    expect(crowdPatchScope({ type: 'crowd:update', totals }, null)).toBeNull()
    expect(crowdPatchScope({ type: 'crowd:update', matchId: '', totals }, null)).toBeNull()
    expect(crowdPatchScope({ type: 'crowd:update', matchId: 'm1' }, null)).toBeNull()
    expect(crowdPatchScope({ type: 'crowd:league-update', matchId: 'm1', leagueId: 42 as unknown, totals }, '42')).toBeNull()
  })
})
