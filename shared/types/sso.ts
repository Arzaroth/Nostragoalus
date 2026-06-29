// SSO provider lifecycle. draft = admin still configuring, not usable for
// sign-in. enabled = live (offered on the login page, links accounts). disabled
// = temporarily paused: hidden from login + new sign-ins rejected, but existing
// sessions keep working (no forced revoke). Mirrors the sso_provider_status
// pg enum on the sso_provider table.
export type SsoProviderStatus = 'draft' | 'enabled' | 'disabled'

// One automated pre-flight check produced by the connection test.
export interface SsoConnectionCheck {
  name: string
  ok: boolean
  detail?: string
}

// Outcome of the automated connection test - the draft -> enabled gate. Persisted
// on sso_provider.lastTestResult. `ok` is true only when every check passed;
// `checkedAt` is an ISO timestamp.
export interface SsoConnectionTestResult {
  ok: boolean
  checkedAt: string
  kind: 'oidc' | 'saml'
  checks: SsoConnectionCheck[]
}
