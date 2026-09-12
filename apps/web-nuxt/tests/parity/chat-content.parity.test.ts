import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/chat-content'
import { parityVectors } from './harness'

// Frozen vectors for the chat wire format. Re-freeze:  pnpm parity:bless
parityVectors(
  'chat-content',
  buildCases,
  fileURLToPath(new URL('../../../../shared/parity-json/chat-content.json', import.meta.url)),
)
