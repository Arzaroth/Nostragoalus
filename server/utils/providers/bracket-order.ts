import type { BracketMatch, NormalizedBracket } from '../../../shared/types/match'

// Order every round so each pair of feeder matches sits directly under its
// parent (the next-round match their winners meet in). Providers list knockout
// matches in arbitrary order; the bracket tree pairs them positionally.
export function orderBracketFeeders(bracket: NormalizedBracket): NormalizedBracket {
  const rounds = bracket.rounds.map((r) => ({ ...r, matches: [...r.matches] }))
  // The third-place tie (single-match round right before a single-match final)
  // is not part of the feeding chain.
  const chain = rounds.filter((r, i) => !(r.matches.length === 1 && i === rounds.length - 2))

  const winnerCode = (m: BracketMatch) => (m.winner === 'HOME' ? m.homeCode : m.winner === 'AWAY' ? m.awayCode : null)

  for (let i = chain.length - 2; i >= 0; i--) {
    const parents = chain[i + 1].matches
    const pool = [...chain[i].matches]
    const ordered: BracketMatch[] = []
    for (const parent of parents) {
      for (const code of [parent.homeCode, parent.awayCode]) {
        if (code == null) continue
        // The feeder whose winner reached this parent slot; for undecided
        // feeders, the one already containing that team.
        let idx = pool.findIndex((m) => winnerCode(m) === code)
        if (idx < 0) idx = pool.findIndex((m) => winnerCode(m) == null && (m.homeCode === code || m.awayCode === code))
        if (idx >= 0) ordered.push(...pool.splice(idx, 1))
      }
    }
    // Anything unresolvable (full-TBD early bracket) keeps kickoff order.
    ordered.push(...pool.sort((a, b) => (a.kickoffTime ?? '').localeCompare(b.kickoffTime ?? '')))
    chain[i].matches = ordered
  }
  return { ...bracket, rounds }
}
