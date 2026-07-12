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

export async function buildCases(): Promise<RawCase[]> {
  return [
    { fn: 'computeConsensus', args: [rows, 'MODE'] },
    { fn: 'computeConsensus', args: [rows, 'MEAN'] },
    { fn: 'computeConsensus', args: [[{ home: 1, away: 2 }], 'MODE'] },
    { fn: 'computeConsensus', args: [[], 'MEAN'] }, // empty -> null
  ]
}
