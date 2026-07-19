export interface ChatPin {
  competition: string
  leagueId: string
  matchId: string | null
}

export function resolvePinnedRoom(
  pin: ChatPin | null,
  followLeagueId: string | null,
  followMatchId: string | null,
): { leagueId: string | null, matchId: string | null } {
  if (pin) return { leagueId: pin.leagueId, matchId: pin.matchId }
  return { leagueId: followLeagueId, matchId: followMatchId }
}

// A pin outlives a competition switch, so it can only be checked against the
// membership list of its own competition - elsewhere the leagues in hand say
// nothing about it.
export function isPinStale(pin: ChatPin | null, slug: string, validLeagueIds: string[]): boolean {
  if (!pin || pin.competition !== slug) return false
  return !validLeagueIds.includes(pin.leagueId)
}
