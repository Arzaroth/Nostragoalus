// Per-bookmaker odds kept alongside a snapshot (BetExplorer-style providers);
// Sofascore exposes a single aggregated feed, so its snapshots store null here.
export interface StoredBookmakerOdds {
  key: string
  title: string
  home: number
  draw: number
  away: number
}

export type OddsSnapshotKind = 'POLL' | 'BACKFILL'

export type OddsProviderKey = 'sofascore' | 'betexplorer'
