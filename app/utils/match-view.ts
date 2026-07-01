// Pure derivations for the match view, extracted so the timeline assembly and
// head-to-head tally are testable without mounting the 500-line page.

import { EXTRA_TIME_BREAK_MINUTE } from '#shared/types/match'
import { formatPlayerName } from './format'

// FIFA stamps break substitutions with an empty minute (no running clock at the
// break), so slot them at the interval - after the half's stoppage, before the
// restart - instead of dumping them at the very end of the timeline. The empty
// string is the half-time break (~45'); the provider rewrites an extra-time-break
// sub to a sentinel so it lands near 105' instead.
export const HALFTIME_VAL = 4599
export const ET_HALFTIME_VAL = 10599

export function minuteVal(minute: string | null): number {
  if (minute === '') return HALFTIME_VAL
  if (minute === EXTRA_TIME_BREAK_MINUTE) return ET_HALFTIME_VAL
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

// Emoji per play-by-play event kind; goals/own-goals/penalties read as the loud
// moments, the rest are quieter markers. `foul` has no entry - the view renders a
// real referee whistle (WhistleIcon) since no whistle emoji exists.
export const TIMELINE_ICONS: Record<string, string> = {
  goal: '⚽',
  'own-goal': '⚽',
  'penalty-goal': '⚽',
  'penalty-missed': '❌',
  'penalty-awarded': '🎯',
  assist: '👟',
  yellow: '🟨',
  red: '🟥',
  'second-yellow': '🟥',
  sub: '🔄',
  shot: '🥅',
  var: '📺',
  period: '⏱️',
}
const GOAL_KINDS = new Set(['goal', 'own-goal', 'penalty-goal'])
// Nameless fallback label per kind, so a row with no resolved actor (e.g. a
// penalty award, a coach booking) is never blank.
const KIND_LABEL_KEYS: Record<string, string> = {
  goal: 'goal',
  'own-goal': 'ownGoal',
  'penalty-goal': 'penaltyGoal',
  'penalty-missed': 'penaltyMissed',
  'penalty-awarded': 'penaltyAwarded',
  assist: 'assist',
  yellow: 'yellow',
  red: 'red',
  'second-yellow': 'secondYellow',
  sub: 'sub',
  shot: 'shot',
  foul: 'foul',
  corner: 'corner',
  var: 'var',
  period: 'period',
}
// Player-actor kinds -> their templated key (carries a {player} placeholder).
const PBP_PLAYER_KEYS: Record<string, string> = {
  goal: 'goal',
  'own-goal': 'ownGoal',
  'penalty-goal': 'penaltyGoal',
  'penalty-missed': 'penaltyMissed',
  assist: 'assist',
  yellow: 'yellow',
  red: 'red',
  'second-yellow': 'secondYellow',
  shot: 'shot',
  foul: 'foul',
  corner: 'corner',
}
const PERIOD_KEYS: Record<string, string> = {
  kickoff: 'kickoff',
  'half-time': 'halfTime',
  'second-half': 'secondHalf',
  'second-half-end': 'secondHalfEnd',
  'extra-time': 'extraTime',
  'extra-time-end': 'extraTimeEnd',
  'full-time': 'fullTime',
}

export function pbpIcon(kind: string): string {
  return TIMELINE_ICONS[kind] ?? ''
}
export function isGoalKind(kind: string): boolean {
  return GOAL_KINDS.has(kind)
}

export interface PbpEventInput {
  kind: string
  playerName?: string | null
  playerInName?: string | null
  playerOutName?: string | null
  periodKind?: string | null
  text?: string | null
}

// A localizable spec instead of a rendered string: the view calls
// `t(spec.key, spec.params)`, or renders `spec.literal` as-is (VAR's decision text
// arrives pre-localized from the feed and can't be rebuilt from structure). `key`
// is '' when there is nothing to show. Keeping `t()` out of here makes the
// branching pure and unit-testable.
export interface PbpTextSpec {
  key: string
  params?: Record<string, string>
  literal?: string
}

// We phrase the commentary ourselves (localized) from the resolved names - the
// team is shown by the flag, so the country never appears in the text.
export function pbpTextSpec(e: PbpEventInput): PbpTextSpec {
  if (e.kind === 'period') return { key: e.periodKind ? `match.pbp.period.${PERIOD_KEYS[e.periodKind] ?? ''}` : '' }
  if (e.kind === 'var') return e.text ? { key: '', literal: e.text } : { key: 'match.pbpKind.var' }
  if (e.kind === 'sub') {
    return e.playerInName && e.playerOutName
      ? { key: 'match.pbp.sub', params: { playerIn: formatPlayerName(e.playerInName), playerOut: formatPlayerName(e.playerOutName) } }
      : { key: 'match.pbpKind.sub' }
  }
  const tmpl = PBP_PLAYER_KEYS[e.kind]
  if (tmpl && e.playerName) return { key: `match.pbp.${tmpl}`, params: { player: formatPlayerName(e.playerName) } }
  const fallback = KIND_LABEL_KEYS[e.kind]
  return { key: fallback ? `match.pbpKind.${fallback}` : '' }
}

// The team code an event belongs to (null for neutral markers); the view resolves
// it to a flag via flagUrl().
export function pbpFlagCode(
  side: string | null | undefined,
  homeCode: string | null | undefined,
  awayCode: string | null | undefined,
): string | null {
  return side === 'HOME' ? (homeCode ?? null) : side === 'AWAY' ? (awayCode ?? null) : null
}
