// Vectors for the consensus-bot scoreline (MODE most-common, MEAN rounded average).
interface RawCase {
  fn: string
  args: unknown[]
}

const rows = [
  { home: 2, away: 1 },
  { home: 2, away: 1 },
  { home: 1, away: 1 },
  { home: 3, away: 0 },
  { home: 2, away: 1 },
  { home: 0, away: 0 },
]

// Two scorelines picked twice each: MODE has to fall through to its tie-break
// (fewest total goals, then fewest home goals).
const modeTie = [
  { home: 2, away: 1 },
  { home: 1, away: 0 },
  { home: 2, away: 1 },
  { home: 1, away: 0 },
  { home: 0, away: 0 },
]

// Two scorelines picked twice each, level on total goals too, so only the home
// count separates them.
const modeSumTie = [
  { home: 2, away: 1 },
  { home: 1, away: 2 },
  { home: 2, away: 1 },
  { home: 1, away: 2 },
  { home: 0, away: 0 },
]

export async function buildCases(): Promise<RawCase[]> {
  return [
    { fn: 'computeConsensus', args: [rows, 'MODE'] },
    { fn: 'computeConsensus', args: [rows, 'MEAN'] },
    { fn: 'computeConsensus', args: [modeTie, 'MODE'] },
    { fn: 'computeConsensus', args: [modeSumTie, 'MODE'] },
    // MODE needs 5 picks - one short is null
    { fn: 'computeConsensus', args: [modeTie.slice(1), 'MODE'] },
    { fn: 'computeConsensus', args: [modeTie, 'MEAN'] },
    { fn: 'computeConsensus', args: [[{ home: 1, away: 2 }], 'MODE'] },
    { fn: 'computeConsensus', args: [[], 'MEAN'] }, // empty -> null
  ]
}
