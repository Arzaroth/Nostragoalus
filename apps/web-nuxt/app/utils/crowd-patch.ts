export interface CrowdTotalsPayload {
  home: number
  away: number
  count: number
}

export interface CrowdPatchMessage {
  type?: unknown
  matchId?: unknown
  leagueId?: unknown
  totals?: CrowdTotalsPayload
}

// Where a crowd:update WS message should land: the global totals, the
// currently selected league's totals, or nowhere (other league / malformed).
export function crowdPatchScope(msg: CrowdPatchMessage, selectedLeagueId: string | null): 'global' | 'league' | null {
  if (typeof msg?.matchId !== 'string' || !msg.matchId || !msg.totals) return null
  if (msg.type === 'crowd:update') return 'global'
  if (msg.type === 'crowd:league-update') {
    return typeof msg.leagueId === 'string' && msg.leagueId === selectedLeagueId ? 'league' : null
  }
  return null
}
