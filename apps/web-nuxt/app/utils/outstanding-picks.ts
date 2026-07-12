// Counts the fixtures still awaiting a pick so the matches page can nudge the
// user before the next lockout. A match is pickable exactly when its score input
// is enabled: kickoff is still ahead (not locked) and both teams are known. This
// mirrors ScoreInput's own disabled rule, so the count never disagrees with the
// rows the user can actually fill in.
export interface PickableMatch {
  id: string
  isLocked: boolean
  homeTeamCode: string | null
  awayTeamCode: string | null
}

export function isMatchPickable(m: PickableMatch): boolean {
  return !m.isLocked && !!m.homeTeamCode && !!m.awayTeamCode
}

export function countOutstandingPicks(
  matches: readonly PickableMatch[],
  predictedMatchIds: ReadonlySet<string>,
): number {
  let n = 0
  for (const m of matches) {
    if (isMatchPickable(m) && !predictedMatchIds.has(m.id)) n++
  }
  return n
}

// First pickable match without a prediction, for the jump-to action. The caller
// passes the kickoff-ordered list, so this is the soonest one needing a pick.
export function firstOutstandingPickId(
  matches: readonly PickableMatch[],
  predictedMatchIds: ReadonlySet<string>,
): string | null {
  for (const m of matches) {
    if (isMatchPickable(m) && !predictedMatchIds.has(m.id)) return m.id
  }
  return null
}
