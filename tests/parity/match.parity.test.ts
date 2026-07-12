import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/match'
import { parityVectors } from './harness'

// Frozen vectors for the pure match/stage predicates. Re-freeze:  pnpm parity:bless
parityVectors('match', buildCases, fileURLToPath(new URL('./vectors/match.json', import.meta.url)))
