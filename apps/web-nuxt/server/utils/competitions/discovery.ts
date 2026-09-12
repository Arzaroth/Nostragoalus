import { providerForCompetition } from '../providers'
import type { DiscoveredCompetition, MatchDataProvider } from '../providers/types'
import { ProviderError, ValidationError } from '../errors'

// Providers that can enumerate what they carry. UEFA's ids are a curated handful
// and the offline fixture provider has exactly one, so neither implements
// discovery; football-data can, but its catalog needs a token, so it stays out
// until someone actually configures one.
export const DISCOVERABLE_PROVIDERS = ['espn'] as const
export type DiscoverableProvider = (typeof DISCOVERABLE_PROVIDERS)[number]

// ESPN's catalog is ~218 entries and each one costs a request to name, so a
// bare refresh of the admin screen would re-walk the whole thing. Cached in
// memory only: it is a convenience, it is per-process, and a stale entry costs
// nothing because the probe re-reads the real fixtures before anything is saved.
const TTL_MS = 10 * 60_000
const cache = new Map<string, { at: number; value: DiscoveredCompetition[] }>()

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
  const now = deps.now ?? Date.now
  // externalCompetitionId is irrelevant to discovery but the factory needs one
  // to build an adapter; any value gives the same catalog.
  const makeProvider =
    deps.makeProvider ?? ((p: string) => providerForCompetition({ provider: p, externalCompetitionId: '', seasonHint: null }))

  const hit = cache.get(provider)
  if (hit && now() - hit.at < TTL_MS) return hit.value

  const adapter = makeProvider(provider)
  if (!adapter.discoverCompetitions) {
    throw new ValidationError(`provider ${provider} cannot list its competitions`)
  }

  let found: DiscoveredCompetition[]
  try {
    found = await adapter.discoverCompetitions()
  } catch (e) {
    // The catalog lives on an undocumented endpoint; a failure there is the
    // provider's, not the admin's, so it must not read as a bad request.
    throw new ProviderError(`could not read ${provider}'s competition catalog: ${(e as Error).message}`)
  }

  cache.set(provider, { at: now(), value: found })
  return found
}
