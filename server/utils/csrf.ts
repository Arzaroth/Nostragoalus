import type { H3Event } from 'h3'
// getRequestHost / createError are Nitro auto-imported globals (a runtime import
// from 'h3' is unresolvable in the unit-test context, matching the rest of the
// server code, which only type-imports from 'h3').

// Defense-in-depth CSRF guard for cookie-session mutations. The session cookie is
// SameSite=Lax, which already blocks cross-site POST/PUT/DELETE; this adds a second
// line for the classic cross-origin request, which a browser always stamps with an
// Origin (or at least a Referer). We only REJECT on a positive host mismatch, so a
// same-origin call (matching Origin) and a non-browser client that sends no Origin
// both pass - only an attacker's cross-site fetch, carrying its own origin, is
// blocked. API-key callers never reach here (they aren't cookie-borne, so not
// CSRF-able); the caller gates on that.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const hostOf = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

// Pure core, exported for tests: given the request method, the browser-stated
// Origin/Referer and the true request host, decide whether to reject. Rejects only
// a mutating request whose stated origin host is present and differs from the host.
export function isCrossOriginMutation(input: {
  method: string
  origin: string | null | undefined
  referer: string | null | undefined
  host: string | null | undefined
}): boolean {
  if (!MUTATING_METHODS.has(input.method.toUpperCase())) return false
  const stated = hostOf(input.origin) ?? hostOf(input.referer)
  if (!stated || !input.host) return false
  return stated !== input.host
}

export function assertSameOrigin(event: H3Event): void {
  const rejected = isCrossOriginMutation({
    method: event.method,
    origin: event.headers.get('origin'),
    referer: event.headers.get('referer'),
    // Trust the proxy's forwarded host: the app runs behind a reverse proxy.
    host: getRequestHost(event, { xForwardedHost: true }),
  })
  if (rejected) throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
}
