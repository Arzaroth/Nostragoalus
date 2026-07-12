import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/commitment'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the commit-reveal ledger. Re-freeze after a
// deliberate semantics change:  pnpm parity:bless
parityVectors('commitment', buildCases, fileURLToPath(new URL('../../shared/parity-json/commitment.json', import.meta.url)))
