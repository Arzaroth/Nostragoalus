export type LeagueRole = 'OWNER' | 'MODERATOR' | 'MEMBER'

// Rename, regenerate the join code, kick members.
export function canManageLeague(role: LeagueRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'MODERATOR'
}

export function canKick(actor: LeagueRole | null | undefined, target: LeagueRole | null | undefined): boolean {
  if (actor === 'OWNER') return target === 'MODERATOR' || target === 'MEMBER'
  if (actor === 'MODERATOR') return target === 'MEMBER'
  return false
}

// Members ask a mod for the code; that keeps "regenerate code" a real
// invite-revocation tool instead of a no-op.
export function canSeeJoinCode(role: LeagueRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'MODERATOR'
}
