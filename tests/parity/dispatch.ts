// Cross-stack parity harness: a name -> function registry so a frozen vector
// (`{ module, fn, args, expected }`) can be replayed by dispatch alone, with no
// reference to the TS impl beyond this table. The SAME vectors run against a
// Dart reimplementation (a mobile client) - the frozen `expected` is the target
// both stacks must hit, and the TS replay here is the drift alarm on this side.
import * as e2ee from '../../app/utils/e2ee'
import * as fergie from '../../server/utils/analytics/fergie'
import * as consensus from '../../server/utils/bot/service'
import * as scoring from '../../server/utils/scoring/engine'
import * as standings from '../../server/utils/stats/standings'
import * as commitment from '#shared/commitment'
import * as kt from '#shared/key-transparency'

// Only pure, deterministic functions belong here: same args -> same result on
// every platform. No I/O, no clock, no randomness (any random input - a salt, a
// nonce, a keypair - is passed in as a frozen arg, never generated inside the
// function under test, so the DECRYPT/derive direction is what a vector locks).
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
  'key-transparency': {
    computeKtEntryHash: kt.computeKtEntryHash,
    verifyKtChain: kt.verifyKtChain,
    loggedKeyFor: kt.loggedKeyFor,
  },
  e2ee: {
    fingerprint: e2ee.fingerprint,
    openGroupKey: e2ee.openGroupKey,
    decryptMessage: e2ee.decryptMessage,
    decryptBytes: e2ee.decryptBytes,
    unwrapPrivateKeyWithRecovery: e2ee.unwrapPrivateKeyWithRecovery,
  },
  scoring: {
    scorePredictions: scoring.scorePredictions,
    computeBonus: scoring.computeBonus,
    buildHistogram: scoring.buildHistogram,
    scoreSyntheticPrediction: scoring.scoreSyntheticPrediction,
  },
  fergie: {
    computeFergie: fergie.computeFergie,
    isAddedTime: fergie.isAddedTime,
  },
  standings: {
    computeGroupStandings: standings.computeGroupStandings,
  },
  consensus: {
    computeConsensus: consensus.computeConsensus,
  },
}

// Raw bytes can't live in JSON, so a Uint8Array arg or result is tagged
// { $b64: "..." } in a vector. `revive` decodes tags in args before the call;
// `encodeBytes` tags a Uint8Array result. A Dart runner uses the same tag.
function isB64Tag(x: unknown): x is { $b64: string } {
  return typeof x === 'object' && x !== null && typeof (x as { $b64?: unknown }).$b64 === 'string'
}

function revive(x: unknown): unknown {
  if (isB64Tag(x)) return Uint8Array.from(Buffer.from(x.$b64, 'base64'))
  if (Array.isArray(x)) return x.map(revive)
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]))
  }
  return x
}

export function encodeBytes(x: unknown): unknown {
  if (x instanceof Uint8Array) return { $b64: Buffer.from(x).toString('base64') }
  if (Array.isArray(x)) return x.map(encodeBytes)
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, encodeBytes(v)]))
  }
  return x
}

export async function dispatch(module: string, fn: string, args: unknown[]): Promise<unknown> {
  const mod = registry[module]
  if (!mod) throw new Error(`parity: unknown module "${module}"`)
  const target = mod[fn]
  if (!target) throw new Error(`parity: unknown fn "${module}.${fn}"`)
  const result = await target(...(args.map(revive) as never[]))
  return encodeBytes(result)
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
