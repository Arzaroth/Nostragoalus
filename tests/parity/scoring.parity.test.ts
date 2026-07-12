import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/scoring'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the scoring logic. Re-freeze after a deliberate
// change:  pnpm parity:bless
parityVectors('scoring', buildCases, fileURLToPath(new URL('../../shared/parity-json/scoring.json', import.meta.url)))
