import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// @better-auth/sso registers a BARE /api/auth/sso/callback alongside the
// per-provider /api/auth/sso/callback/:providerId. The bare one resolves the
// provider from the OAuth state rather than from the path, so the draft/disabled
// provider gate - which deliberately reads only the URL, never the request body
// (server/utils/auth/sso-guard-paths.ts) - cannot match it, and never fires.
//
// It is inert today for exactly one reason: the plugin only writes ssoProviderId
// into the state when its `redirectURI` option is set, and lib/auth.ts does not
// set it. That is a configuration accident, not a guarantee. Setting redirectURI
// is the documented way to share one callback URL across several IdPs, so
// someone will reach for it - and it would silently re-open sign-in for a
// provider an admin left in draft, with every test still green.
//
// A source assertion rather than a runtime one on purpose: the invariant is
// "nobody configured this option", which a runtime read of a constructed auth
// instance can be mocked past, and building the real one needs a database.
const authSource = readFileSync(fileURLToPath(new URL('../lib/auth.ts', import.meta.url)), 'utf8')

function ssoPluginBlock(src: string): string {
  const start = src.indexOf('sso({')
  expect(start, 'the sso() plugin should be configured in lib/auth.ts').toBeGreaterThan(-1)
  // Brace-matched, not a fixed window. A 4000-char slice was shorter than the
  // block (4259) and left its tail - the natural place to append an option -
  // unscanned, so the option this test exists to catch could be added with the
  // test still green.
  const open = src.indexOf('{', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error('could not find the end of the sso({ ... }) options block in lib/auth.ts')
}

describe('the bare SSO callback stays ungated-but-unreachable', () => {
  it('lib/auth.ts does not set redirectURI on the sso plugin', () => {
    const block = ssoPluginBlock(authSource)
    // Not anchored to the line start: `sso({ redirectURI: x })` inline, or a
    // quoted key, would slip past a /^\s*redirectURI/m form.
    const configured = /(^|[{,\s])'?"?redirectURI'?"?\s*:/.test(block)
    expect(
      configured,
      'lib/auth.ts now sets `redirectURI` on the sso plugin. That makes @better-auth/sso put '
      + 'ssoProviderId into the OAuth state, which activates the BARE /api/auth/sso/callback route. '
      + 'SSO_CALLBACK_PREFIXES cannot match that path, so the draft/disabled-provider gate no longer '
      + 'runs and a draft provider can mint a session. Gate the bare callback before setting this.',
    ).toBe(false)
  })

  // If the guard ever learns to cover the bare path, this test should be deleted
  // along with the restriction - so pin what it is actually relying on.
  it('the guard still matches only provider-suffixed callback paths', async () => {
    const { ssoCallbackProviderId } = await import('../server/utils/auth/sso-guard-paths')
    expect(ssoCallbackProviderId('/api/auth/sso/callback/okta')).toBe('okta')
    // The bare path carries no provider segment, which is the whole gap.
    expect(ssoCallbackProviderId('/api/auth/sso/callback')).toBeNull()
    expect(ssoCallbackProviderId('/api/auth/sso/callback/')).toBeNull()
  })
})
