import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/consensus'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the consensus logic. Re-freeze after a deliberate
// change:  pnpm parity:bless
parityVectors('consensus', buildCases, fileURLToPath(new URL('../../../../shared/parity-json/consensus.json', import.meta.url)))
