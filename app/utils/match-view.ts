// Pure derivations for the match view, extracted so the timeline assembly and
// head-to-head tally are testable without mounting the 500-line page.

// FIFA stamps halftime substitutions with an empty minute (no running clock at
// the break), so slot them at the interval - after first-half stoppage, before
// the restart - instead of dumping them at the very end of the timeline.
export const HALFTIME_VAL = 4599

export function minuteVal(minute: string | null): number {
  if (minute === '') return HALFTIME_VAL
  if (!minute) return Number.MAX_SAFE_INTEGER
  const m = /^(\d+)'(?:\+(\d+))?/.exec(minute)
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : Number.MAX_SAFE_INTEGER
}

export type TimelineEvent =
  | { kind: 'goal'; side: string; minute: string | null; playerName: string; ownGoal?: boolean }
  | { kind: 'card'; side: string; minute: string | null; playerName: string; card: string; coach: boolean; teamCode: string | null | undefined }
  | { kind: 'sub'; side: string; minute: string | null; playerName: string; offName: string }

interface TimelineInput {
  goals: any[]
  bookings: any[]
  substitutions: any[]
  homeCode: string | null | undefined
  awayCode: string | null | undefined
  showBookings: boolean
  showSubs: boolean
}

// Goals + (optionally) cards + (optionally) subs, interleaved chronologically.
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const goals = (input.goals ?? []).map((g) => ({ kind: 'goal' as const, ...g }))
  const cards = (input.bookings ?? []).map((b) => ({
    kind: 'card' as const,
    card: b.card,
    side: b.side,
    minute: b.minute,
    playerName: b.playerName,
    coach: !!b.coach,
    teamCode: b.side === 'HOME' ? input.homeCode : input.awayCode,
  }))
  const subs = (input.substitutions ?? []).map((sub) => ({
    kind: 'sub' as const,
    side: sub.side,
    minute: sub.minute,
    playerName: sub.playerOnName,
    offName: sub.playerOffName,
  }))
  return [...goals, ...(input.showBookings ? cards : []), ...(input.showSubs ? subs : [])].sort(
    (a, b) => minuteVal(a.minute) - minuteVal(b.minute),
  )
}

export interface H2HSummary {
  homeWins: number
  draws: number
  awayWins: number
  goalsFor: number
  goalsAgainst: number
}

// All-time tally (FIFA's full calendar) when present, else our own meeting list
// reduced from the home team's perspective.
export function h2hSummaryOf(
  h2hAll: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number } | null | undefined,
  headToHead: { homeTeam: string; homeScore: number | null; awayScore: number | null; awayTeam: string }[] | null | undefined,
  homeTeam: string | null | undefined,
): H2HSummary {
  if (h2hAll) {
    return { homeWins: h2hAll.wins, draws: h2hAll.draws, awayWins: h2hAll.losses, goalsFor: h2hAll.goalsFor, goalsAgainst: h2hAll.goalsAgainst }
  }
  const out: H2HSummary = { homeWins: 0, draws: 0, awayWins: 0, goalsFor: 0, goalsAgainst: 0 }
  for (const h of headToHead ?? []) {
    if (h.homeScore == null || h.awayScore == null) continue
    const winner: 'home' | 'away' | null = h.homeScore > h.awayScore ? 'home' : h.awayScore > h.homeScore ? 'away' : null
    const meHome = h.homeTeam === homeTeam
    out.goalsFor += meHome ? h.homeScore : h.awayScore
    out.goalsAgainst += meHome ? h.awayScore : h.homeScore
    if (!winner) out.draws++
    else if ((winner === 'home' ? h.homeTeam : h.awayTeam) === homeTeam) out.homeWins++
    else out.awayWins++
  }
  return out
}
