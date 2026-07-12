// Vectors for the pure match/stage predicates a client uses for bracket + lock
// logic (in-play, started, single-match round, double-weight, knockout).
interface RawCase {
  fn: string
  args: unknown[]
}

export async function buildCases(): Promise<RawCase[]> {
  const cases: RawCase[] = []
  for (const s of ['SCHEDULED', 'LIVE', 'PAUSED', 'SUSPENDED', 'INTERRUPTED', 'FINISHED']) {
    cases.push({ fn: 'matchIsInPlay', args: [s] })
    cases.push({ fn: 'matchHasStarted', args: [s] })
  }
  // The real AppStage domain (shared/types/match.ts) - so the vectors are a
  // faithful spec of the inputs a client actually sees, plus an unknown string.
  for (const stage of ['GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL', 'UNKNOWN', null]) {
    cases.push({ fn: 'isSingleMatchStage', args: [stage] })
    cases.push({ fn: 'countsDouble', args: [stage] })
    cases.push({ fn: 'isKnockout', args: [stage] })
  }
  return cases
}
