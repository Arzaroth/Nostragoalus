import { createHash, randomBytes, randomUUID } from 'node:crypto'

// Mint an apikey row by hand, matching what @better-auth/api-key's createApiKey
// stores - so a key minted from the CLI (mise-tasks/create-api-key) verifies
// through the plugin exactly like one minted in the admin UI. The CLI task
// mirrors hashApiKey inline (it runs on a prod host with no node_modules); this
// module is the tested source of truth for the format.

export interface MintApiKeyInput {
  name: string
  permissions: Record<string, string[]>
  referenceId: string
  expiresInSeconds?: number | null
}

export interface MintedApiKey {
  plaintext: string
  row: {
    id: string
    name: string
    start: string
    prefix: string
    key: string
    referenceId: string
    configId: string
    enabled: boolean
    rateLimitEnabled: boolean
    requestCount: number
    permissions: string
    expiresAt: Date | null
  }
}

const PREFIX = 'ng_'

// @better-auth/api-key defaultKeyHasher: base64url(SHA-256(key)) without padding.
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('base64url')
}

export function mintApiKey(input: MintApiKeyInput): MintedApiKey {
  // 48 bytes -> 64 base64url chars, clearing better-auth's defaultKeyLength.
  const plaintext = PREFIX + randomBytes(48).toString('base64url')
  const expiresAt =
    input.expiresInSeconds != null ? new Date(Date.now() + input.expiresInSeconds * 1000) : null
  return {
    plaintext,
    row: {
      id: randomUUID(),
      name: input.name,
      start: plaintext.slice(0, 6),
      prefix: PREFIX,
      key: hashApiKey(plaintext),
      referenceId: input.referenceId,
      configId: 'default',
      enabled: true,
      // Machine cadence is governed by the integration, not a per-key quota.
      rateLimitEnabled: false,
      requestCount: 0,
      permissions: JSON.stringify(input.permissions),
      expiresAt,
    },
  }
}
