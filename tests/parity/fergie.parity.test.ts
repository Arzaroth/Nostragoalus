import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/fergie'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the fergie logic. Re-freeze after a deliberate
// change:  pnpm parity:bless
parityVectors('fergie', buildCases, fileURLToPath(new URL('../../shared/parity-json/fergie.json', import.meta.url)))
