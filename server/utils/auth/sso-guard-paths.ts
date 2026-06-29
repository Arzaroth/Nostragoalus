// Which /api/auth/* paths the catch-all gates, factored out so the matching
// rule (exact path or path + query string) is unit-tested rather than only
// exercised through the live route.

// Credential management an SSO-managed account must not touch locally: its
// email, passkeys and 2FA belong to the IdP. (Password endpoints already fail
// naturally - there is no credential account to verify against.)
export const SSO_LOCKED_PATHS = [
  '/api/auth/change-email',
  '/api/auth/passkey/generate-register-options',
  '/api/auth/passkey/verify-registration',
  '/api/auth/two-factor/enable',
] as const

// The SSO plugin ships its own provider-management endpoints gated only by a
// session; registering a provider captures email domains (and trusts the IdP
// for account linking), so over HTTP they are admin-surface only. Our
// /api/admin/sso/* routes call auth.api directly and bypass the catch-all.
export const SSO_ADMIN_ONLY_PATHS = [
  '/api/auth/sso/register',
  '/api/auth/sso/update-provider',
  '/api/auth/sso/delete-provider',
] as const

// SSO callback endpoints that carry the providerId as the final path segment.
// These are where a session is actually issued, so gating them stops a draft or
// disabled provider from ever minting one - even via a hand-crafted sign-in that
// skips the (already provider-filtered) login form. The providerId lives in the
// URL, so the gate never has to read the request body (which auth.handler needs).
const SSO_CALLBACK_PREFIXES = [
  '/api/auth/sso/callback/',
  '/api/auth/sso/saml2/callback/',
  '/api/auth/sso/saml2/sp/acs/',
] as const

function matchesAny(paths: readonly string[], path: string): boolean {
  return paths.some((p) => path === p || path.startsWith(`${p}?`))
}

// The providerId targeted by an SSO callback request, or null if the path is not
// a provider callback (e.g. the SP metadata endpoint, which has no providerId).
export function ssoCallbackProviderId(path: string): string | null {
  const clean = path.split('?')[0]!
  for (const prefix of SSO_CALLBACK_PREFIXES) {
    if (clean.startsWith(prefix)) {
      const segment = clean.slice(prefix.length).split('/')[0]
      return segment ? decodeURIComponent(segment) : null
    }
  }
  return null
}

// Plugin provider-management endpoint reachable over HTTP - block entirely.
export function isSsoAdminOnlyPath(path: string): boolean {
  return matchesAny(SSO_ADMIN_ONLY_PATHS, path)
}

// Credential-management endpoint to deny for SSO-managed sessions.
export function isSsoLockedPath(path: string): boolean {
  return matchesAny(SSO_LOCKED_PATHS, path)
}
