import type { ReactionTotals } from '../../shared/reactions'

export interface ReactionPatchMessage {
  type?: unknown
  matchId?: unknown
  leagueId?: unknown
  totals?: ReactionTotals
}

// Where a reaction WS message should land for the match being viewed: the
// global counts, the selected league's counts, or nowhere (a different match,
// a different league, or a malformed frame).
export function reactionPatchScope(
  msg: ReactionPatchMessage,
  matchId: string,
  selectedLeagueId: string | null,
): 'global' | 'league' | null {
  if (typeof msg?.matchId !== 'string' || msg.matchId !== matchId || !msg.totals) return null
  if (msg.type === 'reaction:update') return 'global'
  if (msg.type === 'reaction:league-update') {
    return typeof msg.leagueId === 'string' && msg.leagueId === selectedLeagueId ? 'league' : null
  }
  return null
}
