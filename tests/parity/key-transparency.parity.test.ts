import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/key-transparency'
import { parityVectors } from './harness'

// Frozen cross-stack vectors for the key-transparency log (chat public-key
// hash chain). Re-freeze after a deliberate semantics change:  pnpm parity:bless
parityVectors('key-transparency', buildCases, fileURLToPath(new URL('./vectors/key-transparency.json', import.meta.url)))
