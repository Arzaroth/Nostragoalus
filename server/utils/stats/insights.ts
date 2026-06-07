import { and, asc, desc, eq, gt, ne, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { computeGroupStandings, type StandingRow } from './standings'
import { getMatchGoals } from './scorers'

export interface FormResult {
  result: 'W' | 'D' | 'L'
  opponent: string
  score: string
}

export interface NextMatch {
  opponent: string
  opponentCode: string | null
  kickoffTime: string
}

export interface HeadToHead {
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  penaltiesHome: number | null
  penaltiesAway: number | null
  kickoffTime: string
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
      // A knockout level after regulation is decided on penalties — use the shootout for W/L.
      if (result === 'D' && pf != null && pa != null && pf !== pa) result = pf > pa ? 'W' : 'L'
      const score = pf != null && pa != null ? `${gf}–${ga} (${pf}–${pa}p)` : `${gf}–${ga}`
      return { result, opponent: isHome ? r.awayTeam : r.homeTeam, score }
    })
}

async function teamNext(db: AppDatabase, competitionId: string, team: string, now: Date, limit: number): Promise<NextMatch[]> {
  const rows = await db
    .select()
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'SCHEDULED'),
        gt(match.kickoffTime, now),
        or(eq(match.homeTeam, team), eq(match.awayTeam, team)),
      ),
    )
    .orderBy(asc(match.kickoffTime))
    .limit(limit)

  return rows.map((r) => {
    const isHome = r.homeTeam === team
    return {
      opponent: isHome ? r.awayTeam : r.homeTeam,
      opponentCode: isHome ? r.awayTeamCode : r.homeTeamCode,
      kickoffTime: new Date(r.kickoffTime).toISOString(),
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
    standings = computeGroupStandings(groupMatches)
  }

  const [homeForm, awayForm, homeNext, awayNext] = await Promise.all([
    teamForm(db, m.competitionId, m.homeTeam, 5),
    teamForm(db, m.competitionId, m.awayTeam, 5),
    teamNext(db, m.competitionId, m.homeTeam, now, 3),
    teamNext(db, m.competitionId, m.awayTeam, now, 3),
  ])

  const h2hRows = await db
    .select()
    .from(match)
    .where(
      and(
        eq(match.competitionId, m.competitionId),
        eq(match.status, 'FINISHED'),
        ne(match.id, m.id),
        or(
          and(eq(match.homeTeam, m.homeTeam), eq(match.awayTeam, m.awayTeam)),
          and(eq(match.homeTeam, m.awayTeam), eq(match.awayTeam, m.homeTeam)),
        ),
      ),
    )
    .orderBy(desc(match.kickoffTime))

  const headToHead: HeadToHead[] = h2hRows
    .filter((r) => r.fullTimeHome != null && r.fullTimeAway != null)
    .map((r) => ({
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      homeScore: r.fullTimeHome as number,
      awayScore: r.fullTimeAway as number,
      penaltiesHome: r.penaltiesHome,
      penaltiesAway: r.penaltiesAway,
      kickoffTime: new Date(r.kickoffTime).toISOString(),
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
