import type { MatchStatus } from '../../shared/types/match'

export function matchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'SCHEDULED':
      return 'Scheduled'
    case 'LIVE':
      return 'Live'
    case 'PAUSED':
      return 'Half-time'
    case 'FINISHED':
      return 'Full-time'
    case 'POSTPONED':
      return 'Postponed'
    case 'CANCELLED':
      return 'Cancelled'
    case 'SUSPENDED':
      return 'Suspended'
    case 'AWARDED':
      return 'Awarded'
  }
}

export type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary'

export function statusSeverity(status: MatchStatus): Severity {
  switch (status) {
    case 'LIVE':
    case 'PAUSED':
      return 'danger'
    case 'FINISHED':
    case 'AWARDED':
      return 'success'
    case 'POSTPONED':
    case 'SUSPENDED':
      return 'warn'
    case 'CANCELLED':
      return 'secondary'
    case 'SCHEDULED':
      return 'info'
  }
}

export function tierLabel(tier: string | null | undefined): string {
  switch (tier) {
    case 'EXACT':
      return 'Exact score'
    case 'DIFF':
      return 'Goal difference'
    case 'OUTCOME':
      return 'Right result'
    case 'MISS':
      return 'Missed'
    default:
      return ''
  }
}

export function isLocked(kickoffTime: string | Date, now: number = Date.now()): boolean {
  return new Date(kickoffTime).getTime() <= now
}

// FIFA flag image derived from a team's tricode (e.g. MEX) — avoids storing crests.
export function flagUrl(code: string | null | undefined): string | null {
  return code ? `https://api.fifa.com/api/v3/picture/flags-sq-3/${code}` : null
}
