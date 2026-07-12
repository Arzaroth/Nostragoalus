import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/standings'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the standings logic. Re-freeze after a deliberate
// change:  pnpm parity:bless
parityVectors('standings', buildCases, fileURLToPath(new URL('./vectors/standings.json', import.meta.url)))
