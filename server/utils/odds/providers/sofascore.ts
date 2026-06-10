import { Agent, fetch as undiciFetch } from 'undici'
import { RateLimiter } from '../../providers/rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from '../../providers/types'
import { fractionalToDecimal } from '../fractional'
import type { FetchedOdds, ListEventsOptions, OddsEvent, OddsProvider } from '../types'
import type { OddsTriple } from '../../../../shared/types/odds'

// Sofascore's unofficial JSON API (the one sofascore.com itself calls).
// Keyless, but Cloudflare-fronted: it wants a browser User-Agent and spaced
// calls. providerRef = uniqueTournament id (World Cup 16, Euro 1); odds come
// from /event/{id}/odds/1/all, market 1 = full-time 1X2, fractional prices,
// and remain available on finished events (retroactive backfill).

interface SofaSeason {
  id: number
  year?: string | null
}

interface SofaEvent {
  id: number
  startTimestamp?: number | null
  status?: { type?: string | null } | null
  homeTeam?: { name?: string | null } | null
  awayTeam?: { name?: string | null } | null
}

interface SofaChoice {
  name?: string | null
  fractionalValue?: string | null
  initialFractionalValue?: string | null
}

interface SofaMarket {
  marketId?: number | null
  choices?: SofaChoice[] | null
}

// Module-level so TypeScript treats it as a unique symbol (narrows unions).
const NOT_FOUND = Symbol('not_found')

const DEFAULT_BASE_URL = 'https://api.sofascore.com'
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
const FULL_TIME_MARKET_ID = 1

// Sofascore's CDN fingerprints the TLS ClientHello: Node's trimmed default
// cipher list is answered with 403 regardless of headers or HTTP version,
// while OpenSSL's stock list ('DEFAULT') passes. Lazy singleton so importing
// the module (tests, builds) never constructs a dispatcher.
let tlsSpoofedFetch: typeof fetch | null = null
function defaultSofascoreFetch(): typeof fetch {
  if (!tlsSpoofedFetch) {
    const dispatcher = new Agent({ connect: { ciphers: 'DEFAULT' } })
    tlsSpoofedFetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
      undiciFetch(input, { ...init, dispatcher })) as unknown as typeof fetch
  }
  return tlsSpoofedFetch
}

export interface SofascoreOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

export function sofascoreProvider(options: SofascoreOptions = {}): OddsProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const doFetch = options.fetchImpl ?? defaultSofascoreFetch()
  // 5s spacing: well under scraping-forum guidance for bulk pulls, and the
  // sync layer additionally caps calls per run.
  const limiter = options.rateLimiter ?? new RateLimiter(5000)

  async function getJson<T>(path: string): Promise<T | typeof NOT_FOUND> {
    await limiter.acquire()
    const response = await doFetch(`${baseUrl}/api/v1${path}`, { headers: { 'user-agent': BROWSER_UA } })
    // Cloudflare answers 403 when it decides we're a bot - same back-off as 429.
    if (response.status === 429 || response.status === 403) throw new ProviderRateLimitError()
    if (response.status === 404) return NOT_FOUND
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    try {
      return (await response.json()) as T
    } catch {
      // A 200 that isn't JSON is Cloudflare serving a bot-challenge page:
      // back off like a rate limit instead of hammering the rest of the batch.
      throw new ProviderRateLimitError()
    }
  }

  async function resolveSeasonId(providerRef: string, seasonHint: string | null): Promise<number | null> {
    const data = await getJson<{ seasons: SofaSeason[] }>(`/unique-tournament/${providerRef}/seasons`)
    const seasons = data === NOT_FOUND ? [] : (data.seasons ?? [])
    if (seasons.length === 0) return null
    if (seasonHint) {
      const hit = seasons.find((s) => s.year === seasonHint)
      if (hit) return hit.id
      // A hint that matches nothing means we'd silently list the wrong
      // edition's events (and burn the call budget recovering nothing).
      throw new ProviderUpstreamError(404, `season "${seasonHint}" not found for tournament ${providerRef}`)
    }
    // Seasons come newest first.
    return seasons[0].id
  }

  function toOddsEvent(raw: SofaEvent): OddsEvent | null {
    const home = raw.homeTeam?.name
    const away = raw.awayTeam?.name
    if (!home || !away || !raw.startTimestamp) return null
    return {
      ref: String(raw.id),
      homeName: home,
      awayName: away,
      kickoff: new Date(raw.startTimestamp * 1000),
      finished: raw.status?.type === 'finished',
    }
  }

  // A tournament edition is ~7 pages; the cap only matters if the upstream
  // flag misbehaves (it would otherwise spin forever at one call per 5s).
  const MAX_EVENT_PAGES = 30

  async function listEvents(opts: ListEventsOptions): Promise<OddsEvent[]> {
    const seasonId = await resolveSeasonId(opts.providerRef, opts.seasonHint)
    if (seasonId === null) return []
    const direction = opts.scope === 'upcoming' ? 'next' : 'last'
    const events: OddsEvent[] = []
    for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
      const data = await getJson<{ events: SofaEvent[]; hasNextPage?: boolean }>(
        `/unique-tournament/${opts.providerRef}/season/${seasonId}/events/${direction}/${page}`,
      )
      if (data === NOT_FOUND) break
      for (const raw of data.events ?? []) {
        const event = toOddsEvent(raw)
        if (event) events.push(event)
      }
      if (!data.hasNextPage) break
      if (page === MAX_EVENT_PAGES - 1) {
        console.warn(`[odds] sofascore event listing for tournament ${opts.providerRef} exceeded ${MAX_EVENT_PAGES} pages - truncated`)
      }
    }
    return events
  }

  function tripleFrom(choices: SofaChoice[], field: 'fractionalValue' | 'initialFractionalValue'): OddsTriple | null {
    const byName = new Map(choices.map((c) => [c.name, c]))
    const home = fractionalToDecimal(byName.get('1')?.[field])
    const draw = fractionalToDecimal(byName.get('X')?.[field])
    const away = fractionalToDecimal(byName.get('2')?.[field])
    if (home === null || draw === null || away === null) return null
    return { home, draw, away }
  }

  async function getEventOdds(ref: string): Promise<FetchedOdds | 'gone' | null> {
    const data = await getJson<{ markets: SofaMarket[] }>(`/event/${ref}/odds/1/all`)
    // 404 = the event itself is gone (deleted/recreated after a reschedule):
    // the mapping is dead and the caller should re-match the fixture.
    if (data === NOT_FOUND) return 'gone'
    const market = data.markets?.find((m) => m.marketId === FULL_TIME_MARKET_ID)
    const current = market?.choices ? tripleFrom(market.choices, 'fractionalValue') : null
    if (!current) return null
    return {
      current,
      initial: tripleFrom(market!.choices!, 'initialFractionalValue'),
      bookmakers: null,
    }
  }

  return { key: 'sofascore', listEvents, getEventOdds }
}
