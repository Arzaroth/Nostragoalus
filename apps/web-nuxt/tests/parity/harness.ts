import { readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { dispatch, type VectorFile } from './dispatch'

interface RawCase {
  fn: string
  args: unknown[]
}

// Register the parity suite for one module. Normal run: load the frozen vectors
// and replay each through the TS impl (drift alarm). PARITY_BLESS: recompute
// `expected` from the impl and rewrite the JSON - the file is the cross-stack
// contract a Dart reimplementation must satisfy.
export function parityVectors(module: string, buildCases: () => Promise<RawCase[]>, vectorsPath: string): void {
  const bless = !!process.env.PARITY_BLESS
  let vectors: VectorFile

  beforeAll(async () => {
    if (bless) {
      const raw = await buildCases()
      const cases = []
      for (const c of raw) cases.push({ ...c, expected: await dispatch(module, c.fn, c.args) })
      vectors = { module, cases }
      writeFileSync(vectorsPath, `${JSON.stringify(vectors, null, 2)}\n`)
    } else {
      vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'))
    }
  })

  describe(`${module} parity vectors`, () => {
    it('has a non-empty, well-formed vector file', () => {
      expect(vectors.module).toBe(module)
      expect(vectors.cases.length).toBeGreaterThan(0)
    })

    it('replays every frozen vector through the TS impl', async () => {
      for (const c of vectors.cases) {
        const actual = await dispatch(module, c.fn, c.args)
        expect(actual, `${c.fn}(${JSON.stringify(c.args)})`).toEqual(c.expected)
      }
    })
  })
}
