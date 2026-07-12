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
  for (const stage of ['GROUP', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL', null]) {
    cases.push({ fn: 'isSingleMatchStage', args: [stage] })
    cases.push({ fn: 'countsDouble', args: [stage] })
    cases.push({ fn: 'isKnockout', args: [stage] })
  }
  return cases
}
