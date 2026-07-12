import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildCases } from './cases/commitment'
import { dispatch, type VectorFile } from './dispatch'

// Frozen cross-stack vectors for the commit-reveal ledger. The JSON is the
// contract a Dart (mobile) reimplementation must satisfy byte-for-byte.
//
//   Normal run  : load the frozen vectors, replay each through the TS impl,
//                 assert it still produces the frozen `expected`. A mismatch =
//                 the TS logic drifted from the published vector - a deliberate
//                 change re-blesses, an accidental one is caught here.
//   PARITY_BLESS: rebuild args from cases/, recompute `expected` from the impl,
//                 rewrite the JSON. Run when the ledger semantics change on
//                 purpose:  PARITY_BLESS=1 pnpm test:run tests/parity
const MODULE = 'commitment'
const vectorsPath = fileURLToPath(new URL('./vectors/commitment.json', import.meta.url))
const bless = !!process.env.PARITY_BLESS

let vectors: VectorFile

beforeAll(async () => {
  if (bless) {
    const raw = await buildCases()
    const cases = []
    for (const c of raw) cases.push({ ...c, expected: await dispatch(MODULE, c.fn, c.args) })
    vectors = { module: MODULE, cases }
    writeFileSync(vectorsPath, `${JSON.stringify(vectors, null, 2)}\n`)
  } else {
    vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'))
  }
})

describe('commitment parity vectors', () => {
  it('has a non-empty, well-formed vector file', () => {
    expect(vectors.module).toBe(MODULE)
    expect(vectors.cases.length).toBeGreaterThan(0)
  })

  it('replays every frozen vector through the TS impl', async () => {
    for (const c of vectors.cases) {
      const actual = await dispatch(MODULE, c.fn, c.args)
      expect(actual, `${c.fn}(${JSON.stringify(c.args)})`).toEqual(c.expected)
    }
  })
})
