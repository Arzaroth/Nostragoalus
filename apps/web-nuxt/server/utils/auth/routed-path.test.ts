import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { routedPath } from './routed-path'

// h3 gives a handler two different views of the target: `event.path` is
// percent-DECODED, while `event.node.req.originalUrl` is the raw request line -
// and the raw one is what getRequestURL (so toWebRequest, so better-auth) routes
// on. The fake mirrors both so the encoded cases are exercised honestly.
const decode = (s: string) => { try { return decodeURI(s) } catch { return s } }
const ev = (raw: string, host = 'n') =>
  ({ path: decode(raw), node: { req: { originalUrl: raw, headers: { host } } } }) as unknown as H3Event

describe('routedPath', () => {
  it('passes a plain path through', () => {
    expect(routedPath(ev('/api/auth/scim/generate-token'))).toBe('/api/auth/scim/generate-token')
  })

  it('resolves dot segments the way better-call routes them', () => {
    expect(routedPath(ev('/api/auth/x/../scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/./scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/a/b/../../sso/register'))).toBe('/api/auth/sso/register')
  })

  it('resolves percent-encoded dot segments', () => {
    expect(routedPath(ev('/api/auth/x/%2e%2e/scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/x/%2E%2E/scim/generate-token'))).toBe('/api/auth/scim/generate-token')
  })

  // The whole point of the helper: an encoding that h3 decodes into a path
  // delimiter must not truncate the guard's view while the router still resolves
  // the traversal. `%23` would end the path at `/api/auth/x` for a guard reading
  // event.path, and `%3f` would start a query there.
  it('matches the routed path for encodings that h3 decodes into delimiters', () => {
    expect(routedPath(ev('/api/auth/x%23/../scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/x%3f/../sso/register'))).toBe('/api/auth/sso/register')
    expect(routedPath(ev('/api/auth/x%5c/../scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/%2ex/../passkey/generate-register-options'))).toBe('/api/auth/passkey/generate-register-options')
  })

  it('drops the query string', () => {
    expect(routedPath(ev('/api/auth/sso/callback/pid?code=abc'))).toBe('/api/auth/sso/callback/pid')
  })

  // getRequestURL collapses a leading `//` run, so the guard cannot have its
  // first segment eaten as an authority while the router keeps it.
  it('collapses leading slashes instead of reading a host', () => {
    expect(routedPath(ev('//api/auth/scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('//'))).toBe('/')
  })

  // better-call 404s a trailing-slash mismatch itself, so the guard must see the
  // path as-sent rather than a stripped variant the router never routes.
  it('keeps a trailing slash, matching what the router receives', () => {
    expect(routedPath(ev('/api/auth/scim/generate-token/'))).toBe('/api/auth/scim/generate-token/')
  })

  // The helper runs in a GLOBAL middleware, so a target node's parser accepts but
  // `new URL` would reject must not throw - that would 500 every route.
  it('does not throw on targets node accepts but the URL parser would reject', () => {
    for (const raw of ['//', '///', '//?x', '//[/x', '//:', '/\\']) {
      expect(() => routedPath(ev(raw))).not.toThrow()
    }
  })
})
