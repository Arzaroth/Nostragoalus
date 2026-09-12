import { providerForCompetition } from '../providers'
import type { DiscoveredCompetition, MatchDataProvider } from '../providers/types'
import { createTtlCache } from '../cache/ttl-cache'
import { ProviderError, ValidationError } from '../errors'

// Providers that can enumerate what they carry. UEFA's ids are a curated handful
// and the offline fixture provider has exactly one, so neither implements
// discovery; football-data can, but its catalog needs a token, so it stays out
// until someone actually configures one.
export const DISCOVERABLE_PROVIDERS = ['espn'] as const
export type DiscoverableProvider = (typeof DISCOVERABLE_PROVIDERS)[number]

// ESPN's catalog is ~218 entries and each one costs a request to name, so a
// bare refresh of the admin screen would re-walk the whole thing. In-process
// only: it is a convenience, and a stale entry costs nothing because the probe
// re-reads the real fixtures before anything is saved.
const cache = createTtlCache<string, DiscoveredCompetition[]>({ ttlMs: 10 * 60_000 })

export function clearDiscoveryCache(): void {
  cache.clear()
}

export interface DiscoveryDeps {
  // Injected so this is testable without a Nitro runtime: the real factory
  // reads useRuntimeConfig() for the keyed providers' credentials.
  makeProvider?: (provider: string) => MatchDataProvider
  now?: () => number
}

export async function discoverForProvider(
  provider: DiscoverableProvider,
  deps: DiscoveryDeps = {},
): Promise<DiscoveredCompetition[]> {
  const now = deps.now?.()
  // externalCompetitionId is irrelevant to discovery but the factory needs one
  // to build an adapter; any value gives the same catalog.
  const makeProvider =
    deps.makeProvider ?? ((p: string) => providerForCompetition({ provider: p, externalCompetitionId: '', seasonHint: null }))

  const hit = cache.get(provider, now)
  if (hit) return hit

  const adapter = makeProvider(provider)
  if (!adapter.discoverCompetitions) {
    throw new ValidationError(`provider ${provider} cannot list its competitions`)
  }

  let found: DiscoveredCompetition[]
  try {
    found = await adapter.discoverCompetitions()
  } catch (e) {
    // The catalog lives on an undocumented endpoint; a failure there is the
    // provider's, not the admin's, so it must not read as a bad request. The
    // upstream's own text stays on `cause` - it can be a WAF's HTML page.
    throw new ProviderError(`could not read ${provider}'s competition catalog`, { cause: e })
  }

  // A rate-limited or half-failed walk can still resolve, just short. Caching an
  // empty catalog would wedge the admin's screen for the whole TTL with no error
  // and no way to retry.
  if (found.length > 0) cache.set(provider, found, now)
  return found
}
