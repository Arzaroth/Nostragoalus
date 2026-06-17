import { describe, it, expect } from 'vitest'
import { reactionPatchScope } from './reaction-patch'

const totals = { FIRE: 1, GOAL: 0, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 0 }

describe('reactionPatchScope', () => {
  it('routes plain messages to global and league messages to the selected league', () => {
    expect(reactionPatchScope({ type: 'reaction:update', matchId: 'm1', totals }, 'm1', null)).toBe('global')
    expect(reactionPatchScope({ type: 'reaction:update', matchId: 'm1', totals }, 'm1', 'l1')).toBe('global')
    expect(reactionPatchScope({ type: 'reaction:league-update', matchId: 'm1', leagueId: 'l1', totals }, 'm1', 'l1')).toBe('league')
  })

  it('drops messages for other matches', () => {
    expect(reactionPatchScope({ type: 'reaction:update', matchId: 'm2', totals }, 'm1', null)).toBeNull()
  })

  it('drops messages for other leagues or with no selection', () => {
    expect(reactionPatchScope({ type: 'reaction:league-update', matchId: 'm1', leagueId: 'l2', totals }, 'm1', 'l1')).toBeNull()
    expect(reactionPatchScope({ type: 'reaction:league-update', matchId: 'm1', leagueId: 'l1', totals }, 'm1', null)).toBeNull()
    expect(reactionPatchScope({ type: 'reaction:league-update', matchId: 'm1', leagueId: 42 as unknown, totals }, 'm1', '42')).toBeNull()
  })

  it('drops malformed messages', () => {
    expect(reactionPatchScope({ type: 'match:update', matchId: 'm1', totals }, 'm1', null)).toBeNull()
    expect(reactionPatchScope({ type: 'reaction:update', totals }, 'm1', null)).toBeNull()
    expect(reactionPatchScope({ type: 'reaction:update', matchId: 'm1' }, 'm1', null)).toBeNull()
  })
})
