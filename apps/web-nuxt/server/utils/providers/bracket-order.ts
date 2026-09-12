import type { AppStage, BracketMatch, NormalizedBracket, NormalizedMatch } from '../../../shared/types/match'

const winnerCode = (m: BracketMatch) =>
  m.winner === 'HOME' ? m.homeCode : m.winner === 'AWAY' ? m.awayCode : null

// A still-undecided feeder slot reads as a match-number reference ("W73", the
// winner of match 73; "RU101", that match's runner-up for the third-place tie).
// Returns the referenced match number, or null for a code/group/worded slot.
function feederRefNumber(placeholder: string): number | null {
  const m = placeholder.trim().match(/^(?:W|RU)\s*(\d+)$/i)
  return m ? Number(m[1]) : null
}

// Map each parent's "W{n}" reference to the feeder it points at. When the
// provider tags each feeder with its own match number, "W{n}" resolves directly
// to the feeder numbered n - exact, no positional assumption. Otherwise fall
// back: a provider's match ids are often monotonic in match number within a
// round, so the undecided feeders sorted by id line up one-for-one with the
// referenced numbers sorted ascending - recovering number -> feeder without a
// tournament-specific base. Empty (so the caller falls back further) unless the
// references resolve cleanly.
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

  // Exact path: feeders carry their own match number.
  const byNumber = new Map<number, BracketMatch>()
  for (const m of pool) if (m.matchNumber != null) byNumber.set(m.matchNumber, m)
  if (refs.every((n) => byNumber.has(n))) {
    for (const n of refs) map.set(n, byNumber.get(n) as BracketMatch)
    return map
  }

  // Fallback: assume provider ids are monotonic in match number.
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

const KNOCKOUT_ORDER: AppStage[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

const STAGE_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

function toBracketMatch(m: NormalizedMatch): BracketMatch {
  return {
    providerMatchId: m.providerMatchId,
    status: m.status,
    kickoffTime: m.kickoffTime,
    homeTeam: m.homeTeam.name,
    homeCode: m.homeTeam.code,
    awayTeam: m.awayTeam.name,
    awayCode: m.awayTeam.code,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    homePens: m.score.penalties?.home ?? null,
    awayPens: m.score.penalties?.away ?? null,
    winner: m.winner === 'HOME' || m.winner === 'AWAY' ? m.winner : null,
  }
}

// Build a bracket from a flat fixture list, for the providers that publish no
// bracket feed of their own (UEFA, ESPN). The third-place tie is left out of the
// rounds on purpose: it feeds nothing, and giving it a round of its own crowns
// its winner beside the champion.
export function bracketFromKnockoutMatches(matches: NormalizedMatch[]): NormalizedBracket | null {
  const byStage = new Map<AppStage, NormalizedMatch[]>()
  for (const m of matches) {
    if (!KNOCKOUT_ORDER.includes(m.stage)) continue
    byStage.set(m.stage, [...(byStage.get(m.stage) ?? []), m])
  }
  const final = byStage.get('FINAL')?.[0]
  if (!final) return null

  const stages = KNOCKOUT_ORDER.filter((s) => byStage.has(s))
  const champCode =
    final.winner === 'HOME' ? final.homeTeam.code : final.winner === 'AWAY' ? final.awayTeam.code : null

  return orderBracketFeeders({
    winner: champCode
      ? { name: champCode === final.homeTeam.code ? final.homeTeam.name : final.awayTeam.name, code: champCode }
      : null,
    rounds: stages.map((stage, index) => ({
      name: STAGE_LABELS[stage],
      sequence: index + 1,
      matches: byStage.get(stage)!.map(toBracketMatch),
    })),
  })
}
