// Cross-stack parity harness: a name -> function registry so a frozen vector
// (`{ module, fn, args, expected }`) can be replayed by dispatch alone, with no
// reference to the TS impl beyond this table. The SAME vectors run against a
// Dart reimplementation (a mobile client) - the frozen `expected` is the target
// both stacks must hit, and the TS replay here is the drift alarm on this side.
import * as commitment from '#shared/commitment'

// Only pure, deterministic functions belong here: same args -> same result on
// every platform. No I/O, no clock, no randomness (a salted input is passed in
// as a frozen arg, never generated inside the function under test).
const registry: Record<string, Record<string, (...args: never[]) => unknown>> = {
  commitment: {
    sha256Hex: commitment.sha256Hex,
    computeSubject: commitment.computeSubject,
    computeCommitment: commitment.computeCommitment,
    computeEntryHash: commitment.computeEntryHash,
    verifyLedger: commitment.verifyLedger,
    witnessExtension: commitment.witnessExtension,
    computeLeagueCommitment: commitment.computeLeagueCommitment,
    computeLeagueEntryHash: commitment.computeLeagueEntryHash,
    verifyLeagueLedger: commitment.verifyLeagueLedger,
  },
}

export async function dispatch(module: string, fn: string, args: unknown[]): Promise<unknown> {
  const mod = registry[module]
  if (!mod) throw new Error(`parity: unknown module "${module}"`)
  const target = mod[fn]
  if (!target) throw new Error(`parity: unknown fn "${module}.${fn}"`)
  return await target(...(args as never[]))
}

export interface FrozenCase {
  fn: string
  args: unknown[]
  expected: unknown
}

export interface VectorFile {
  module: string
  cases: FrozenCase[]
}
