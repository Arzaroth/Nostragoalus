export interface ChatPin {
  userId: string
  competition: string
  leagueId: string
  matchId: string | null
}

// The pin is persisted in localStorage, so it can hold anything: a hand-edited
// value, or a shape from an older release. A pin the dock cannot read would hide
// the very button that unpins it, so refuse it instead of trusting it.
export function asChatPin(value: unknown): ChatPin | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  if (typeof p.userId !== 'string' || typeof p.competition !== 'string' || typeof p.leagueId !== 'string') return null
  if (p.matchId !== null && typeof p.matchId !== 'string') return null
  return { userId: p.userId, competition: p.competition, leagueId: p.leagueId, matchId: p.matchId }
}

// A pin outlives a competition switch, so its league can only be checked against
// the membership list of its own competition - elsewhere the leagues in hand say
// nothing about it. It does not outlive the account that made it: localStorage is
// per device, and the next user on that device must not inherit it.
export function isPinStale(
  pin: ChatPin | null,
  userId: string | null,
  slug: string,
  chatLeagueIds: string[],
): boolean {
  if (!pin) return false
  if (pin.userId !== userId) return true
  if (pin.competition !== slug) return false
  return !chatLeagueIds.includes(pin.leagueId)
}
