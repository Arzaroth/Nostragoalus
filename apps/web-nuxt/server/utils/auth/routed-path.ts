import type { H3Event } from 'h3'

// The path an /api/auth/* guard must match is the one better-auth will route on,
// and that is NOT `event.path`. The catch-all dispatches
// `auth.handler(toWebRequest(event))`, and h3 builds that Request from
// `getRequestURL(event)`, whose path is
//   (event.node.req.originalUrl || event.path).replace(/^[/\\]+/g, '/')
// - the RAW request target, with a leading slash run collapsed. `event.path` is
// the percent-DECODED target (h3 runs it through ufo's decodePath), so the two
// disagree on anything encoded: `/api/auth/x%23/../scim/generate-token` decodes
// to a `#` that ends the path at `/api/auth/x` for a guard reading event.path,
// while the router still resolves the `..` and dispatches
// `/api/auth/scim/generate-token`. Same for `%3f`, `%5c` and `%2e`.
//
// So derive the path the way h3 does, then let the same WHATWG parser resolve it.
// The origin is a fixed placeholder: only the pathname is used, and hard-coding it
// keeps a forged Host header from throwing in here (getRequestURL would).
// Trailing slashes are deliberately NOT stripped - better-call 404s a
// trailing-slash mismatch itself (`skipTrailingSlashes` defaults to false and we
// never set it), so stripping would make the guard judge a path the router never
// routes.
export function routedPath(event: H3Event): string {
  const raw = (event.node?.req?.originalUrl || event.path).replace(/^[/\\]+/g, '/')
  return new URL(raw, 'http://n').pathname
}
