import type { BracketMatch, NormalizedBracket } from '../../../shared/types/match'

const winnerCode = (m: BracketMatch) =>
  m.winner === 'HOME' ? m.homeCode : m.winner === 'AWAY' ? m.awayCode : null

// A still-undecided feeder slot reads as a match-number reference ("W73", the
// winner of match 73; "RU101", that match's runner-up for the third-place tie).
// Returns the referenced match number, or null for a code/group/worded slot.
function feederRefNumber(placeholder: string): number | null {
  const m = placeholder.trim().match(/^(?:W|RU)\s*(\d+)$/i)
  return m ? Number(m[1]) : null
}

// Map each parent's "W{n}" reference to the feeder it points at. The feeder
// match carries no number of its own, but a provider's match ids are monotonic
// in match number within a round, so the undecided feeders sorted by id line up
// one-for-one with the referenced numbers sorted ascending - recovering
// number -> feeder without hardcoding a tournament-specific base. Empty (so the
// caller falls back) unless the references and undecided feeders form a clean
// bijection over numeric ids.
function refToFeeder(parents: BracketMatch[], pool: BracketMatch[]): Map<number, BracketMatch> {
  const refs: number[] = []
  for (const p of parents) {
    for (const ph of [p.homeTeam, p.awayTeam]) {
      const n = feederRefNumber(ph)
      if (n != null) refs.push(n)
    }
  }
  const map = new Map<number, BracketMatch>()
  if (refs.length === 0) return map
  const undecided = pool.filter((m) => winnerCode(m) == null && /^\d+$/.test(m.providerMatchId))
  if (undecided.length !== refs.length) return map
  refs.sort((a, b) => a - b)
  undecided.sort((a, b) => Number(a.providerMatchId) - Number(b.providerMatchId))
  refs.forEach((n, i) => map.set(n, undecided[i]))
  return map
}

// Order every round so each pair of feeder matches sits directly under its
// parent (the next-round match their winners meet in). Providers list knockout
// matches in arbitrary order; the bracket tree pairs them positionally. A parent
// slot identifies its feeder by the team already there (decided or official) or,
// while still TBD, by a "W{n}" match-number reference - only when neither is
// readable do we fall back to kickoff order.
export function orderBracketFeeders(bracket: NormalizedBracket): NormalizedBracket {
  const rounds = bracket.rounds.map((r) => ({ ...r, matches: [...r.matches] }))
  // The third-place tie (single-match round right before a single-match final)
  // is not part of the feeding chain.
  const chain = rounds.filter((r, i) => !(r.matches.length === 1 && i === rounds.length - 2))

  for (let i = chain.length - 2; i >= 0; i--) {
    const parents = chain[i + 1].matches
    const pool = [...chain[i].matches]
    const byRef = refToFeeder(parents, pool)
    const ordered: BracketMatch[] = []

    for (const parent of parents) {
      const sides: { code: string | null; placeholder: string }[] = [
        { code: parent.homeCode, placeholder: parent.homeTeam },
        { code: parent.awayCode, placeholder: parent.awayTeam },
      ]
      for (const { code, placeholder } of sides) {
        let idx = -1
        if (code != null) {
          // The feeder whose winner reached this parent slot; for undecided
          // feeders, the one already containing that team.
          idx = pool.findIndex((m) => winnerCode(m) === code)
          if (idx < 0) idx = pool.findIndex((m) => winnerCode(m) == null && (m.homeCode === code || m.awayCode === code))
        } else {
          const ref = feederRefNumber(placeholder)
          const feeder = ref != null ? byRef.get(ref) : undefined
          if (feeder) idx = pool.indexOf(feeder)
        }
        if (idx >= 0) ordered.push(...pool.splice(idx, 1))
      }
    }
    // Anything unresolvable (full-TBD early bracket with no references) keeps
    // kickoff order.
    ordered.push(...pool.sort((a, b) => (a.kickoffTime ?? '').localeCompare(b.kickoffTime ?? '')))
    chain[i].matches = ordered
  }
  return { ...bracket, rounds }
}
