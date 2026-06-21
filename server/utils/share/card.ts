import type { ShareLocale, ShareMode } from './token'

// The visual state the card renders in. Derived from match timing + scoring, NOT
// taken verbatim from the token: a 'sealed' token auto-upgrades to a result once
// the match kicks off and the score is public, and a pre-kickoff token can never
// produce a 'result'/'live' that would expose an in-progress field.
export type ShareCardState = 'result' | 'live' | 'reveal' | 'sealed'

// Structural subset of getPredictionForShare's row - kept as an interface so the
// builder is a pure function testable without a database.
export interface ShareCardInput {
  homeGoals: number
  awayGoals: number
  isJoker: boolean
  baseTier: string | null
  totalPoints: number | null
  crowdShare: string | number | null
  kickoffTime: Date | string
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  penaltiesHome: number | null
  penaltiesAway: number | null
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  roundLabel: string
  group: string | null
  competitionName: string
  ownerName: string
}

export interface ShareCardData {
  state: ShareCardState
  locale: ShareLocale
  ownerName: string
  competitionName: string
  // Raw provider round label; localized in the template via roundLabel().
  roundLabel: string
  group: string | null
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  // The sharer's predicted score. null in 'sealed' state so neither the image
  // nor the card-summary JSON ever exposes a pre-kickoff pick.
  predHome: number | null
  predAway: number | null
  // The real scoreline, only once the match is finished + scored.
  actualHome: number | null
  actualAway: number | null
  pensHome: number | null
  pensAway: number | null
  tier: string | null
  totalPoints: number | null
  isJoker: boolean
  // Integer percent of the field that called this exact score (rarity brag),
  // null when not applicable.
  crowdSharePct: number | null
}

function isFinished(status: string): boolean {
  return status === 'FINISHED' || status === 'AWARDED'
}

function resolveState(input: ShareCardInput, mode: ShareMode, now: Date): ShareCardState {
  const locked = now.getTime() >= new Date(input.kickoffTime).getTime()
  if (locked) {
    return isFinished(input.status) && input.totalPoints !== null ? 'result' : 'live'
  }
  // Pre-kickoff: only the owner-chosen reveal exposes the score; anything else
  // (including a defensive stray 'result') stays sealed.
  return mode === 'reveal' ? 'reveal' : 'sealed'
}

export function buildShareCardData(
  input: ShareCardInput,
  opts: { mode: ShareMode; locale: ShareLocale },
  now: Date = new Date(),
): ShareCardData {
  const state = resolveState(input, opts.mode, now)
  const showScore = state !== 'sealed'
  const isResult = state === 'result'

  const crowdRaw = input.crowdShare == null ? null : Number(input.crowdShare)
  const crowdSharePct = isResult && crowdRaw != null && Number.isFinite(crowdRaw) ? Math.round(crowdRaw * 100) : null

  return {
    state,
    locale: opts.locale,
    ownerName: input.ownerName,
    competitionName: input.competitionName,
    roundLabel: input.roundLabel,
    group: input.group,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    homeTeamCode: input.homeTeamCode,
    awayTeamCode: input.awayTeamCode,
    predHome: showScore ? input.homeGoals : null,
    predAway: showScore ? input.awayGoals : null,
    actualHome: isResult ? input.fullTimeHome : null,
    actualAway: isResult ? input.fullTimeAway : null,
    pensHome: isResult ? input.penaltiesHome : null,
    pensAway: isResult ? input.penaltiesAway : null,
    tier: isResult ? input.baseTier : null,
    totalPoints: isResult ? input.totalPoints : null,
    isJoker: showScore ? input.isJoker : false,
    crowdSharePct,
  }
}
