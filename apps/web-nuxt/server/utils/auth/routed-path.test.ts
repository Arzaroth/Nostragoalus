import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { routedPath } from './routed-path'

const ev = (path: string) => ({ path }) as H3Event

describe('routedPath', () => {
  it('passes a plain path through', () => {
    expect(routedPath(ev('/api/auth/scim/generate-token'))).toBe('/api/auth/scim/generate-token')
  })

  it('resolves dot segments the way better-call routes them', () => {
    expect(routedPath(ev('/api/auth/x/../scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/./scim/generate-token'))).toBe('/api/auth/scim/generate-token')
    expect(routedPath(ev('/api/auth/a/b/../../sso/register'))).toBe('/api/auth/sso/register')
  })

  it('treats a backslash as a separator, as the URL parser does', () => {
    expect(routedPath(ev('/api/auth/sso\\register'))).toBe('/api/auth/sso/register')
  })

  it('drops the query string', () => {
    expect(routedPath(ev('/api/auth/sso/callback/pid?code=abc'))).toBe('/api/auth/sso/callback/pid')
  })
})
