import { describe, it, expect } from 'vitest'

process.env.NUXT_SSO_KEK = Buffer.alloc(32, 7).toString('base64')

const { openConfig, sealConfig } = await import('./config')

describe('sso config seal/open', () => {
  it('round-trips a config through seal -> open', () => {
    const config = { clientId: 'cid', clientSecret: 'shh', scopes: ['openid', 'email'] }
    const sealed = sealConfig(config)
    // The sealed string is a JSON envelope, never the plaintext secret.
    expect(sealed).not.toContain('shh')
    expect(openConfig(sealed)).toEqual(config)
  })

  it('returns an empty object for a null column', () => {
    expect(openConfig(null)).toEqual({})
  })

  it('reads a legacy plaintext JSON config as-is', () => {
    expect(openConfig(JSON.stringify({ clientId: 'plain' }))).toEqual({ clientId: 'plain' })
  })
})
