import type { AppStage, MatchStatus } from '../../../shared/types/match'

const FOOTBALL_DATA_STATUS: Record<string, MatchStatus> = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'SCHEDULED',
  IN_PLAY: 'LIVE',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  SUSPENDED: 'SUSPENDED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  AWARDED: 'AWARDED',
}

const FOOTBALL_DATA_STAGE: Record<string, AppStage> = {
  GROUP_STAGE: 'GROUP',
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: 'THIRD_PLACE',
  FINAL: 'FINAL',
}

const API_FOOTBALL_STATUS: Record<string, MatchStatus> = {
  TBD: 'SCHEDULED',
  NS: 'SCHEDULED',
  '1H': 'LIVE',
  '2H': 'LIVE',
  ET: 'LIVE',
  BT: 'LIVE',
  P: 'LIVE',
  LIVE: 'LIVE',
  INT: 'INTERRUPTED',
  HT: 'PAUSED',
  FT: 'FINISHED',
  AET: 'FINISHED',
  PEN: 'FINISHED',
  SUSP: 'SUSPENDED',
  PST: 'POSTPONED',
  CANC: 'CANCELLED',
  ABD: 'CANCELLED',
  AWD: 'AWARDED',
  WO: 'AWARDED',
}

export function mapFootballDataStatus(status: string): MatchStatus {
  return FOOTBALL_DATA_STATUS[status] ?? 'SCHEDULED'
}

export function mapFootballDataStage(stage: string): AppStage {
  return FOOTBALL_DATA_STAGE[stage] ?? 'GROUP'
}

export function parseFootballDataGroup(group: string | null | undefined): string | null {
  if (!group) return null
  const match = String(group).match(/([A-L])$/i)
  return match ? match[1].toUpperCase() : null
}

export function mapApiFootballStatus(status: string): MatchStatus {
  return API_FOOTBALL_STATUS[status] ?? 'SCHEDULED'
}

export function mapApiFootballRound(round: string): {
  stage: AppStage
  group: string | null
  matchday: number | null
} {
  const group = round.match(/^Group ([A-L])(?:\s*-\s*(\d+))?/i)
  if (group) {
    return { stage: 'GROUP', group: group[1].toUpperCase(), matchday: group[2] ? Number(group[2]) : null }
  }

  const r = round.toLowerCase()
  if (r.includes('round of 32')) return { stage: 'R32', group: null, matchday: null }
  if (r.includes('round of 16')) return { stage: 'R16', group: null, matchday: null }
  if (r.includes('quarter')) return { stage: 'QF', group: null, matchday: null }
  if (r.includes('semi')) return { stage: 'SF', group: null, matchday: null }
  if (r.includes('3rd place') || r.includes('third place')) return { stage: 'THIRD_PLACE', group: null, matchday: null }
  if (r.includes('final')) return { stage: 'FINAL', group: null, matchday: null }
  return { stage: 'GROUP', group: null, matchday: null }
}
