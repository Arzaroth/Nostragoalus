import { RateLimiter } from '../../server/utils/providers/rate-limiter'
import { visit } from '../../scripts/canary/run'
import type { CanarySource } from '../../scripts/canary/source'

export const NOW = new Date('2026-03-01T12:00:00Z')

export interface Route {
  match: (url: string) => boolean
  answer: unknown
  status?: number
}

/**
 * A `fetch` over canned routes, so a source is driven through the REAL runner:
 * the ledger ownership, the error taxonomy and fetchJson's status handling are
 * then covered by every source test instead of being stubbed away.
 */
export function stubFetch(routes: Route[]): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input)
    const route = routes.find((r) => r.match(url))
    if (!route) throw new Error(`the stub feed has no answer for ${url}`)
    const status = route.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(route.answer), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

/** Runs a source over canned routes. No pacing: the tests must not sleep. */
export async function drive(source: CanarySource, routes: Route[]) {
  const result = await visit(source, {
    now: NOW,
    fetchImpl: stubFetch(routes),
    limiter: new RateLimiter(0),
  })
  return {
    ...result,
    failures: [...result.ledger.failures(), ...result.problems],
  }
}

/** Drops a key from a deep clone, so one fixture can be amputated many ways. */
export function without<T>(doc: T, path: string): T {
  const clone = structuredClone(doc)
  const { parent, last } = resolve(clone, path)
  // `delete arr[i]` leaves a HOLE: the length is unchanged and the entry reads
  // as undefined, so the canary reports "not an object" and the test proves the
  // anomaly path rather than the amputation it claims.
  if (Array.isArray(parent)) parent.splice(Number(last), 1)
  else delete (parent as Record<string, unknown>)[last]
  return clone
}

export function replace<T>(doc: T, path: string, value: unknown): T {
  const clone = structuredClone(doc)
  const { parent, last } = resolve(clone, path)
  if (Array.isArray(parent)) parent[Number(last)] = value
  else (parent as Record<string, unknown>)[last] = value
  return clone
}

/**
 * Throws on a path that does not resolve. A helper that silently returned the
 * clone untouched made every `expect(failures).toEqual([])` on a mistyped path
 * a guaranteed false green.
 */
function resolve(doc: unknown, path: string): { parent: unknown; last: string } {
  const keys = path.split('.')
  const last = keys.pop()
  if (!last) throw new Error(`empty path`)
  let cursor: unknown = doc
  for (const key of keys) {
    cursor = Array.isArray(cursor) ? cursor[Number(key)] : (cursor as Record<string, unknown>)?.[key]
    if (cursor == null) throw new Error(`the fixture has no ${path} (stopped at ${key})`)
  }
  const container = cursor as Record<string, unknown>
  if (container == null || !(last in container)) throw new Error(`the fixture has no ${path}`)
  return { parent: cursor, last }
}
