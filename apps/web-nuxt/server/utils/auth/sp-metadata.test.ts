import { describe, it, expect } from 'vitest'
import { buildSpMetadata } from './sp-metadata'
import { ValidationError } from '../errors'

describe('buildSpMetadata', () => {
  it('builds the descriptor with the ACS callback and defaults entityId to the origin', () => {
    const { xml, filename } = buildSpMetadata({ providerId: 'acme', origin: 'https://goal.example' })
    expect(filename).toBe('nostragoalus-sp-acme.xml')
    expect(xml).toContain('entityID="https://goal.example"')
    expect(xml).toContain('Location="https://goal.example/api/auth/sso/saml2/callback/acme"')
    expect(xml).toContain('WantAssertionsSigned="true"')
  })

  it('uses an explicit entityId when given', () => {
    const { xml } = buildSpMetadata({ providerId: 'acme', entityId: 'urn:acme:sp', origin: 'https://goal.example' })
    expect(xml).toContain('entityID="urn:acme:sp"')
  })

  it('falls back to the origin when entityId is blank', () => {
    const { xml } = buildSpMetadata({ providerId: 'acme', entityId: '   ', origin: 'https://goal.example' })
    expect(xml).toContain('entityID="https://goal.example"')
  })

  it('rejects a providerId outside the safe charset', () => {
    for (const bad of ['', 'a b', '../evil', 'a/b', 'evil"/><x', 'a<b', 'a&b']) {
      expect(() => buildSpMetadata({ providerId: bad, origin: 'https://goal.example' })).toThrow(ValidationError)
    }
  })

  it('XML-escapes the entityId so it cannot break out of the attribute', () => {
    const { xml } = buildSpMetadata({
      providerId: 'acme',
      entityId: 'https://x.example/?a=1&b=2"><evil>',
      origin: 'https://goal.example',
    })
    expect(xml).toContain('a=1&amp;b=2&quot;&gt;&lt;evil&gt;')
    expect(xml).not.toContain('"><evil>')
  })

  it('escapes a malicious origin in both the entityId default and the ACS location', () => {
    const { xml } = buildSpMetadata({ providerId: 'acme', origin: 'https://x"/><evil' })
    expect(xml).not.toContain('"/><evil')
    // " -> &quot;, > -> &gt;, < -> &lt; (the slash is left as-is, harmless in XML).
    expect(xml).toContain('&quot;/&gt;&lt;evil')
  })
})
