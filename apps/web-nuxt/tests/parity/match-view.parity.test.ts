import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/match-view'
import { parityVectors } from './harness'

// Frozen vectors for the play-by-play labelling. Re-freeze:  pnpm parity:bless
parityVectors('match-view', buildCases, fileURLToPath(new URL('../../../../shared/parity-json/match-view.json', import.meta.url)))
