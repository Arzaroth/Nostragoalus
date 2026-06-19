import type { MatchStatus } from '#shared/types/match'

// vue-i18n's translate function, narrowed to what these helpers use. Passing it
// in keeps these pure/testable while the labels stay localized.
export type Translate = (key: string, named?: Record<string, unknown>) => string

export function matchStatusLabel(status: MatchStatus, t: Translate): string {
  switch (status) {
    case 'SCHEDULED':
      return t('match.statusLabel.scheduled')
    case 'LIVE':
      return t('match.statusLabel.live')
    case 'PAUSED':
      return t('match.statusLabel.halfTime')
    case 'FINISHED':
      return t('match.statusLabel.fullTime')
    case 'POSTPONED':
      return t('match.statusLabel.postponed')
    case 'CANCELLED':
      return t('match.statusLabel.cancelled')
    case 'SUSPENDED':
      return t('match.statusLabel.suspended')
    case 'AWARDED':
      return t('match.statusLabel.awarded')
  }
}

// Provider bracket round names arrive in English; map the known ones to a key,
// else fall back to the raw name. Order matters: "semi-finals" contains "final".
export function roundLabel(name: string | null | undefined, t: Translate): string {
  const n = (name ?? '').toLowerCase()
  if (/round of 32|last 32/.test(n)) return t('bracket.round.r32')
  if (/round of 16|last 16/.test(n)) return t('bracket.round.r16')
  if (/quarter/.test(n)) return t('bracket.round.qf')
  if (/semi/.test(n)) return t('bracket.round.sf')
  if (/third/.test(n)) return t('bracket.round.third')
  if (/final/.test(n)) return t('bracket.round.final')
  return name ?? ''
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

export function tierLabel(tier: string | null | undefined, t: Translate): string {
  switch (tier) {
    case 'EXACT':
      return t('predictions.tier.exact')
    case 'DIFF':
      return t('predictions.tier.diff')
    case 'OUTCOME':
      return t('predictions.tier.outcome')
    case 'MISS':
      return t('predictions.tier.miss')
    default:
      return ''
  }
}

export function isLocked(kickoffTime: string | Date, now: number = Date.now()): boolean {
  return new Date(kickoffTime).getTime() <= now
}

// A second-chance (re-picked) pick scores half, rounded down - the one source of
// truth for the halving the champion/best-scorer pickers display. The award
// itself halves server-side (per-row SQL for champion, flat for best scorer).
export function halvePickPoints(points: number): number {
  return Math.floor(points / 2)
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

// A provider-supplied headshot URL, made square. FIFA's digitalhub URL needs a
// transform query for the 1:1 crop; other URLs pass through untouched.
export function squarePlayerPhoto(pictureUrl: string | null | undefined, size = 320): string | null {
  if (!pictureUrl) return null
  if (pictureUrl.includes('digitalhub.fifa.com')) {
    return `${pictureUrl}?io=transform:fill,aspectratio:1x1,width:${size},gravity:top&quality=75`
  }
  return pictureUrl
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
