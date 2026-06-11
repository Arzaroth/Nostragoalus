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

// FIFA flag image derived from a team's tricode (e.g. MEX) - avoids storing crests.
export function flagUrl(code: string | null | undefined): string | null {
  return code ? `https://api.fifa.com/api/v3/picture/flags-sq-3/${code}` : null
}

// Player headshot from the FIXTURES provider's picture CDN, keyed by that
// provider's player id (FIFA ids -> FIFA, UEFA ids -> UEFA - they don't cross).
// UEFA needs the season in the path. Not every player has one; callers must
// fall back on image error. Defaults to FIFA (the World Cup).
export function playerPhotoUrl(
  playerId: string | null | undefined,
  opts?: { provider?: string | null; season?: string | null },
): string | null {
  if (!playerId) return null
  if (opts?.provider === 'uefa') {
    const season = opts.season || '2024'
    return `https://img.uefa.com/imgml/TP/players/3/${season}/324x324/${playerId}.jpg`
  }
  return `https://api.fifa.com/api/v3/picture/players-sq-3/${playerId}`
}

// "4–2" when a shootout actually happened, else null (0–0 penalty rows are sync artifacts).
export function pensResult(m: { penaltiesHome?: number | null; penaltiesAway?: number | null }): string | null {
  const h = m.penaltiesHome ?? null
  const a = m.penaltiesAway ?? null
  if (h == null || a == null || h + a <= 0) return null
  return `${h}–${a}`
}

// Upstream feeds mix "Kylian MBAPPÉ" (FIFA) with "Kylian Mbappé" (UEFA).
// Normalize to title case: only fully-uppercased words are rewritten, so
// already-correct names ("McTominay", "van Dijk") pass through untouched.
export function formatPlayerName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((word) =>
      word === word.toUpperCase() && /\p{Lu}{2}/u.test(word)
        ? word
            .split(/([-'])/)
            .map((part) => (part.length > 1 ? part[0] + part.slice(1).toLowerCase() : part))
            .join('')
        : word,
    )
    .join(' ')
}

// Accent-insensitive search matching: "Tur" finds "Türkiye", "FRA" finds France.
export function searchable(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
}
