import type { OddsProviderKey, StoredBookmakerOdds } from '../../../shared/types/odds'

export interface OddsTriple {
  home: number
  draw: number
  away: number
}

// A provider-side event candidate for the name+kickoff matcher.
export interface OddsEvent {
  ref: string
  homeName: string
  awayName: string
  kickoff: Date
  finished: boolean
}

export interface FetchedOdds {
  // Oriented to the PROVIDER's home side; the sync layer swaps when the
  // matcher detected reversed orientation.
  current: OddsTriple
  initial: OddsTriple | null
  bookmakers: StoredBookmakerOdds[] | null
}

export interface ListEventsOptions {
  providerRef: string
  seasonHint: string | null
  scope: 'upcoming' | 'finished'
}

export interface OddsProvider {
  readonly key: OddsProviderKey
  listEvents(opts: ListEventsOptions): Promise<OddsEvent[]>
  // null = the event exists but exposes no 1X2 market.
  getEventOdds(ref: string): Promise<FetchedOdds | null>
}
