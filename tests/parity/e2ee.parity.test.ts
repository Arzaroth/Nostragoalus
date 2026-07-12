import { fileURLToPath } from 'node:url'
import { buildCases } from './cases/e2ee'
import { parityVectors } from './harness'

// Interop KATs for the E2EE chat crypto (libsodium): decrypt/unseal/derive
// vectors a Dart reimplementation must reproduce. Re-freeze only when the crypto
// scheme changes (vectors churn on fresh randomness):  pnpm parity:bless
parityVectors('e2ee', buildCases, fileURLToPath(new URL('./vectors/e2ee.json', import.meta.url)))
