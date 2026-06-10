import type { OddsProviderKey, OddsTriple, StoredBookmakerOdds } from '../../../shared/types/odds'

// Canonical OddsTriple lives in shared/types/odds.ts (the client renders it too).
export type { OddsTriple }

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
  // null = the event exists but exposes no 1X2 market (try again later);
  // 'gone' = the event no longer exists (deleted/recreated upstream), so the
  // caller should drop the mapping and let the matcher re-claim the fixture.
  getEventOdds(ref: string): Promise<FetchedOdds | 'gone' | null>
}
