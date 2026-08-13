import type { H3Event } from 'h3'

// better-auth dispatches on the WHATWG-normalized pathname (better-call parses
// `new URL(request.url)`, and h3's toWebRequest builds that URL from event.path),
// while event.path itself keeps `.`, `..` and `\` segments verbatim. A guard that
// matches event.path therefore sees a different string than the router, and
// /api/auth/x/../scim/generate-token walks straight past it. Normalize with the
// same parser so guard and dispatcher can never disagree; the origin is a
// placeholder because only the pathname is used.
export function routedPath(event: H3Event): string {
  return new URL(event.path, 'http://n').pathname
}
