import { IN_PLAY_STATUSES, type MatchStatus } from '#shared/types/match'

// Derives a per-team "crowd lean" for the world map from the aggregate crowd
// prediction totals (the same data the "show everyone's totals" preference
// exposes - summed predicted goals per match side, no individual picks). For each
// team it picks the match that matters now (a live one, else the next scheduled)
// and reads how the crowd expects that team to fare in it. Pure + unit-tested so
// the load-bearing logic doesn't live untested inside the map page.

export interface LeanMatch {
  id: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  kickoffTime: string | Date
  status: MatchStatus
}

export type CrowdTotals = Record<string, { home: number; away: number; count: number }>

// "In play" follows the shared definition (LIVE/PAUSED/SUSPENDED/INTERRUPTED), so
// a halted-but-ongoing match still counts as the team's current one rather than
// being skipped in favour of a future fixture.
const inPlay = (s: MatchStatus): boolean => IN_PLAY_STATUSES.includes(s)

function kickoff(m: LeanMatch): number {
  return new Date(m.kickoffTime).getTime()
}

// A team's "current" match: any in-play match it plays (earliest if several), else
// its earliest upcoming one. Finished/cancelled matches are ignored.
function pickCurrentMatches(matches: LeanMatch[]): Record<string, LeanMatch> {
  const current: Record<string, LeanMatch> = {}
  for (const m of matches) {
    const live = inPlay(m.status)
    if (!live && m.status !== 'SCHEDULED') continue
    for (const code of [m.homeTeamCode, m.awayTeamCode]) {
      if (!code) continue
      const cur = current[code]
      if (!cur) {
        current[code] = m
        continue
      }
      const curLive = inPlay(cur.status)
      if (live && !curLive) current[code] = m
      else if (live === curLive && kickoff(m) < kickoff(cur)) current[code] = m
    }
  }
  return current
}

// Maps each team code to a lean in [-1, 1]: +1 the crowd strongly backs this
// team to outscore its opponent in its current match, -1 strongly against, 0
// even. Teams with no current match or no predictions are omitted (no tint).
export function computeTeamLean(matches: LeanMatch[], totals: CrowdTotals): Record<string, number> {
  const current = pickCurrentMatches(matches)
  const out: Record<string, number> = {}
  for (const code in current) {
    const m = current[code]
    const ct = totals[m.id]
    if (!ct || ct.count <= 0) continue
    const sum = ct.home + ct.away
    if (sum <= 0) continue
    const raw = m.homeTeamCode === code ? ct.home - ct.away : ct.away - ct.home
    out[code] = Math.max(-1, Math.min(1, raw / sum))
  }
  return out
}

// A diverging colour scale for the flag ring: blue when the crowd favours the
// team, red when it backs the opponent, pale/neutral near even.
export function leanColor(v: number): string {
  const c = Math.max(-1, Math.min(1, v))
  const mag = Math.abs(c)
  const hue = c >= 0 ? 212 : 6
  const sat = Math.round(20 + 70 * mag)
  const light = Math.round(82 - 36 * mag)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}
