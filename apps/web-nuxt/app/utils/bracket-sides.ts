import type { BracketRound } from '#shared/types/match'
import { roundLabelKey } from '#shared/share-card'

export interface BracketSides {
  left: BracketRound[]
  right: BracketRound[]
  final: BracketRound | null
  third: BracketRound | null
}

// The final and the third-place play-off are pulled out of the round list and
// rendered in the centre column (trophy / final / third); everything else is a
// knockout round that fans out symmetrically to the left and right of it. The
// round is identified through the shared name ladder, because BracketRound
// carries only the provider's display name - see TODO.md for carrying the
// frozen `stage` enum through the bracket endpoint instead.
export function splitBracketSides(rounds: BracketRound[]): BracketSides | null {
  if (!rounds.length) return null
  const final = rounds.find((r) => roundLabelKey(r.name) === 'bracket.round.final') ?? null
  const third = rounds.find((r) => roundLabelKey(r.name) === 'bracket.round.third') ?? null
  const side = rounds.filter((r) => r !== final && r !== third).sort((a, b) => a.sequence - b.sequence)
  const half = (r: BracketRound) => Math.ceil(r.matches.length / 2)
  return {
    left: side.map((r) => ({ ...r, matches: r.matches.slice(0, half(r)) })),
    right: side.map((r) => ({ ...r, matches: r.matches.slice(half(r)) })).reverse(),
    final,
    third,
  }
}
