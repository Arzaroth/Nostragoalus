import { and, asc, desc, eq, gt, lt, ne, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition as competitionTable, match } from '../../../db/schema'
import { computeGroupStandings, type StandingRow } from './standings'
import { getMatchGoals } from './scorers'

export interface FormResult {
  matchId: string
  result: 'W' | 'D' | 'L'
  opponent: string
  score: string
}

export interface NextMatch {
  matchId: string
  opponent: string
  opponentCode: string | null
  kickoffTime: string
  // Filled when that later match has since been played (viewing a past match).
  result: 'W' | 'D' | 'L' | null
  score: string | null
}

export interface HeadToHead {
  matchId: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  penaltiesHome: number | null
  penaltiesAway: number | null
  kickoffTime: string
  competitionSlug: string
  competitionName: string
}

export interface MatchGoalView {
  side: 'HOME' | 'AWAY'
  teamName: string
  teamCode: string | null
  playerName: string
  minute: string | null
  ownGoal: boolean
  assistPlayerName: string | null
}

export interface MatchInsights {
  standings: StandingRow[] | null
  form: { home: FormResult[]; away: FormResult[] }
  next: { home: NextMatch[]; away: NextMatch[] }
  headToHead: HeadToHead[]
  possession: { home: number | null; away: number | null }
  goals: MatchGoalView[]
}

// Goal minutes are strings like "45'+7'"; parse to a sortable number (base * 100 + stoppage).
export function minuteValue(minute: string | null): number {
  if (!minute) return 1e9
  const m = minute.match(/(\d+)(?:[^\d]*\+(\d+))?/)
  return m ? Number(m[1]) * 100 + (m[2] ? Number(m[2]) : 0) : 1e9
}

async function teamForm(db: AppDatabase, competitionId: string, team: string, limit: number): Promise<FormResult[]> {
  const rows = await db
    .select()
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'FINISHED'),
        or(eq(match.homeTeam, team), eq(match.awayTeam, team)),
      ),
    )
    .orderBy(desc(match.kickoffTime))
    .limit(limit)

  return rows
    .filter((r) => r.fullTimeHome != null && r.fullTimeAway != null)
    .map((r) => {
      const isHome = r.homeTeam === team
      const gf = (isHome ? r.fullTimeHome : r.fullTimeAway) as number
      const ga = (isHome ? r.fullTimeAway : r.fullTimeHome) as number
      const pf = isHome ? r.penaltiesHome : r.penaltiesAway
      const pa = isHome ? r.penaltiesAway : r.penaltiesHome
      let result: FormResult['result'] = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
      // A knockout level after regulation is decided on penalties - use the shootout for W/L.
      if (result === 'D' && pf != null && pa != null && pf !== pa) result = pf > pa ? 'W' : 'L'
      // only real shootouts - 0-0 penalty rows are sync artifacts
      const score = pf != null && pa != null && pf + pa > 0 ? `${gf}–${ga} (${pf}–${pa}p)` : `${gf}–${ga}`
      return { matchId: r.id, result, opponent: isHome ? r.awayTeam : r.homeTeam, score }
    })
}

// The team's matches in this competition AFTER the focus match - relative to
// the match being viewed, not to the wall clock. Later games may already be
// played (when browsing history); those carry their result.
async function teamNext(db: AppDatabase, competitionId: string, team: string, after: Date, limit: number): Promise<NextMatch[]> {
  const rows = await db
    .select()
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        gt(match.kickoffTime, after),
        or(eq(match.homeTeam, team), eq(match.awayTeam, team)),
      ),
    )
    .orderBy(asc(match.kickoffTime))
    .limit(limit)

  return rows.map((r) => {
    const isHome = r.homeTeam === team
    const played = r.status === 'FINISHED' && r.fullTimeHome != null && r.fullTimeAway != null
    const gf = isHome ? r.fullTimeHome : r.fullTimeAway
    const ga = isHome ? r.fullTimeAway : r.fullTimeHome
    return {
      matchId: r.id,
      opponent: isHome ? r.awayTeam : r.homeTeam,
      opponentCode: isHome ? r.awayTeamCode : r.homeTeamCode,
      kickoffTime: new Date(r.kickoffTime).toISOString(),
      result: played ? ((gf as number) > (ga as number) ? 'W' : (gf as number) < (ga as number) ? 'L' : 'D') : null,
      score: played ? `${gf}–${ga}` : null,
    }
  })
}

export async function getMatchInsights(db: AppDatabase, matchId: string, now: Date = new Date()): Promise<MatchInsights | null> {
  const rows = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
  if (rows.length === 0) return null
  const m = rows[0]

  let standings: StandingRow[] | null = null
  if (m.stage === 'GROUP' && m.groupName) {
    const groupMatches = await db
      .select()
      .from(match)
      .where(and(eq(match.competitionId, m.competitionId), eq(match.groupName, m.groupName)))
    // Match view: fold in-progress matches into the table so it tracks live.
    standings = computeGroupStandings(groupMatches, { includeLive: true })
  }

  const [homeForm, awayForm, homeNext, awayNext] = await Promise.all([
    teamForm(db, m.competitionId, m.homeTeam, 5),
    teamForm(db, m.competitionId, m.awayTeam, 5),
    teamNext(db, m.competitionId, m.homeTeam, new Date(m.kickoffTime), 3),
    teamNext(db, m.competitionId, m.awayTeam, new Date(m.kickoffTime), 3),
  ])

  // Head-to-head spans every competition we know - inside one tournament two
  // teams rarely meet twice. Codes match across providers; names are the fallback.
  const pair = (a: 'homeTeamCode' | 'homeTeam', b: 'awayTeamCode' | 'awayTeam', va: string, vb: string) =>
    or(and(eq(match[a], va), eq(match[b], vb)), and(eq(match[a], vb), eq(match[b], va)))
  const h2hRows = await db
    .select({ m: match, slug: competitionTable.slug, name: competitionTable.name })
    .from(match)
    .innerJoin(competitionTable, eq(competitionTable.id, match.competitionId))
    .where(
      and(
        eq(match.status, 'FINISHED'),
        ne(match.id, m.id),
        lt(match.kickoffTime, m.kickoffTime), // history only - later results don't color a past match
        m.homeTeamCode && m.awayTeamCode
          ? pair('homeTeamCode', 'awayTeamCode', m.homeTeamCode, m.awayTeamCode)
          : pair('homeTeam', 'awayTeam', m.homeTeam, m.awayTeam),
      ),
    )
    .orderBy(desc(match.kickoffTime))

  const headToHead: HeadToHead[] = h2hRows
    .filter((r) => r.m.fullTimeHome != null && r.m.fullTimeAway != null)
    .map((r) => ({
      matchId: r.m.id,
      homeTeam: r.m.homeTeam,
      awayTeam: r.m.awayTeam,
      homeScore: r.m.fullTimeHome as number,
      awayScore: r.m.fullTimeAway as number,
      penaltiesHome: r.m.penaltiesHome,
      penaltiesAway: r.m.penaltiesAway,
      kickoffTime: new Date(r.m.kickoffTime).toISOString(),
      competitionSlug: r.slug,
      competitionName: r.name,
    }))

  const goalRows = await getMatchGoals(db, m.id)
  const goals: MatchGoalView[] = goalRows
    .map((g) => ({
      side: g.side as 'HOME' | 'AWAY',
      teamName: g.teamName,
      teamCode: g.teamCode,
      playerName: g.playerName,
      minute: g.minute,
      ownGoal: g.ownGoal,
      assistPlayerName: g.assistPlayerName,
    }))
    .sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute))

  return {
    standings,
    form: { home: homeForm, away: awayForm },
    next: { home: homeNext, away: awayNext },
    headToHead,
    possession: {
      home: m.possessionHome != null ? Number(m.possessionHome) : null,
      away: m.possessionAway != null ? Number(m.possessionAway) : null,
    },
    goals,
  }
}
