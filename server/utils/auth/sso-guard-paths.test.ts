import { describe, it, expect } from 'vitest'
import { isSsoAdminOnlyPath, isSsoLockedPath } from './sso-guard-paths'

describe('isSsoAdminOnlyPath', () => {
  it('matches the plugin provider-management endpoints, with or without a query', () => {
    expect(isSsoAdminOnlyPath('/api/auth/sso/register')).toBe(true)
    expect(isSsoAdminOnlyPath('/api/auth/sso/update-provider?x=1')).toBe(true)
    expect(isSsoAdminOnlyPath('/api/auth/sso/delete-provider')).toBe(true)
  })
  it('does not match the user-facing SSO sign-in / callback paths', () => {
    expect(isSsoAdminOnlyPath('/api/auth/sign-in/sso')).toBe(false)
    expect(isSsoAdminOnlyPath('/api/auth/sso/callback/acme')).toBe(false)
    // not a prefix-only match: a longer path that merely starts with the name
    expect(isSsoAdminOnlyPath('/api/auth/sso/register-extra')).toBe(false)
  })
})

describe('isSsoLockedPath', () => {
  it('matches the credential-management endpoints, with or without a query', () => {
    expect(isSsoLockedPath('/api/auth/change-email')).toBe(true)
    expect(isSsoLockedPath('/api/auth/passkey/generate-register-options')).toBe(true)
    expect(isSsoLockedPath('/api/auth/passkey/verify-registration?y=2')).toBe(true)
    expect(isSsoLockedPath('/api/auth/two-factor/enable')).toBe(true)
  })
  it('leaves other auth endpoints (sign-in, sign-out, reset) alone', () => {
    expect(isSsoLockedPath('/api/auth/sign-in/email')).toBe(false)
    expect(isSsoLockedPath('/api/auth/change-password')).toBe(false)
    expect(isSsoLockedPath('/api/auth/two-factor/disable')).toBe(false)
    expect(isSsoLockedPath('/api/auth/change-email-extra')).toBe(false)
  })
})
