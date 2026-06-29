import { decryptSecret, encryptSecret, isSealed } from '../crypto/envelope'

// Opens a stored oidcConfig/samlConfig column into its plain object. The column
// holds a JSON-stringified SealedSecret when written through the encrypted
// adapter; a legacy plaintext JSON string is returned as-is. Shared by the admin
// update route and the SSO service so there is one decrypt path.
export function openConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  return JSON.parse(isSealed(parsed) ? decryptSecret(parsed) : raw)
}

// Seals a provider config object for storage (envelope-encrypted at rest).
export function sealConfig(config: Record<string, unknown>): string {
  return JSON.stringify(encryptSecret(JSON.stringify(config)))
}
