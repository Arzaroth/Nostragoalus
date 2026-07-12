import { aliasedTable, and, asc, eq, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition as competitionTable, match, prediction, round, user } from '../../../db/schema'
import { NotFoundError } from '../errors'
import { canViewProfile } from '../leagues/service'
import { outcomeOf } from '../scoring/tiers'
import type { H2HMatch, H2HPlayer, H2HResponse } from '#shared/types/h2h'

// One match both players have a scored pick for, joined to the result. The pure
// aggregation below turns a chronological list of these into the report.
export interface H2HPickRow {
  matchId: string
  roundLabel: string
  roundOrder: number
  homeTeam: string
  awayTeam: string
  homeCode: string | null
  awayCode: string | null
  actualHome: number
  actualAway: number
  aHome: number
  aAway: number
  aPoints: number
  bHome: number
  bAway: number
  bPoints: number
}

const MAX_DIVERGENCES = 6

function toMatch(row: H2HPickRow): H2HMatch {
  const aOut = outcomeOf({ home: row.aHome, away: row.aAway })
  const bOut = outcomeOf({ home: row.bHome, away: row.bAway })
  return {
    matchId: row.matchId,
    home: row.homeTeam,
    away: row.awayTeam,
    homeCode: row.homeCode,
    awayCode: row.awayCode,
    actual: `${row.actualHome}-${row.actualAway}`,
    aPredicted: `${row.aHome}-${row.aAway}`,
    bPredicted: `${row.bHome}-${row.bAway}`,
    aPoints: row.aPoints,
    bPoints: row.bPoints,
    winner: row.aPoints > row.bPoints ? 'a' : row.aPoints < row.bPoints ? 'b' : 'tie',
    diverged: aOut !== bOut,
  }
}

function empty(competitionName: string, a: H2HPlayer, b: H2HPlayer): H2HResponse {
  return {
    competitionName,
    a,
    b,
    shared: 0,
    hasData: false,
    aPoints: 0,
    bPoints: 0,
    aWins: 0,
    bWins: 0,
    ties: 0,
    agreement: { sameScore: 0, sameOutcome: 0 },
    overTime: [],
    divergences: [],
  }
}

// Pure aggregation over the shared scored matches - rows arrive in chronological
// order so the cumulative lead chart reads left to right. Split out so it is
// unit-testable without a database.
export function computeHeadToHead(
  competitionName: string,
  a: H2HPlayer,
  b: H2HPlayer,
  rows: H2HPickRow[],
): H2HResponse {
  if (rows.length === 0) return empty(competitionName, a, b)

  let aPoints = 0
  let bPoints = 0
  let aWins = 0
  let bWins = 0
  let ties = 0
  let sameScore = 0
  let sameOutcome = 0
  const matches = rows.map(toMatch)
  const roundMap = new Map<number, { label: string; order: number; aSum: number; bSum: number }>()

  rows.forEach((row, i) => {
    aPoints += row.aPoints
    bPoints += row.bPoints
    const m = matches[i]
    if (m.winner === 'a') aWins += 1
    else if (m.winner === 'b') bWins += 1
    else ties += 1
    if (row.aHome === row.bHome && row.aAway === row.bAway) sameScore += 1
    if (!m.diverged) sameOutcome += 1

    const bucket = roundMap.get(row.roundOrder) ?? { label: row.roundLabel, order: row.roundOrder, aSum: 0, bSum: 0 }
    bucket.aSum += row.aPoints
    bucket.bSum += row.bPoints
    roundMap.set(row.roundOrder, bucket)
  })

  let aRun = 0
  let bRun = 0
  const overTime = [...roundMap.values()]
    .sort((x, y) => x.order - y.order)
    .map((r) => {
      aRun += r.aSum
      bRun += r.bSum
      return { label: r.label, order: r.order, aPoints: aRun, bPoints: bRun }
    })

  const divergences = matches
    .filter((m) => m.diverged)
    // matchId breaks a points-gap tie so which six survive the slice is stable
    // across DB row order.
    .sort((x, y) => Math.abs(y.aPoints - y.bPoints) - Math.abs(x.aPoints - x.bPoints) || x.matchId.localeCompare(y.matchId))
    .slice(0, MAX_DIVERGENCES)

  return {
    competitionName,
    a,
    b,
    shared: rows.length,
    hasData: true,
    aPoints,
    bPoints,
    aWins,
    bWins,
    ties,
    agreement: { sameScore, sameOutcome },
    overTime,
    divergences,
  }
}

async function loadPlayer(db: AppDatabase, id: string): Promise<H2HPlayer | null> {
  const rows = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (rows.length === 0) return null
  return { id: rows[0].id, name: rows[0].name, image: rows[0].image }
}

// Loads both players' scored picks on the shared matches of one competition and
// hands them to the pure replay. Profile privacy is enforced for BOTH players:
// a private profile 404s (not 403) for anyone who can't view it, matching the
// profile endpoint so probing an id never confirms the account exists.
export async function getHeadToHead(
  db: AppDatabase,
  opts: { competitionId: string; aId: string; bId: string; viewerId: string | null; isAdmin: boolean },
): Promise<H2HResponse> {
  const [comp] = await db
    .select({ name: competitionTable.name })
    .from(competitionTable)
    .where(eq(competitionTable.id, opts.competitionId))
    .limit(1)
  if (!comp) throw new NotFoundError('competition not found')

  const a = await loadPlayer(db, opts.aId)
  const b = await loadPlayer(db, opts.bId)
  if (!a || !b) throw new NotFoundError('user not found')

  for (const id of [opts.aId, opts.bId]) {
    const allowed = await canViewProfile(db, { viewerId: opts.viewerId, targetUserId: id, isAdmin: opts.isAdmin })
    if (!allowed) throw new NotFoundError('user not found')
  }

  const pa = aliasedTable(prediction, 'pa')
  const pb = aliasedTable(prediction, 'pb')
  const rows = await db
    .select({
      matchId: match.id,
      roundLabel: round.label,
      roundOrder: round.sortOrder,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeCode: match.homeTeamCode,
      awayCode: match.awayTeamCode,
      actualHome: match.fullTimeHome,
      actualAway: match.fullTimeAway,
      aHome: pa.homeGoals,
      aAway: pa.awayGoals,
      aPoints: pa.totalPoints,
      bHome: pb.homeGoals,
      bAway: pb.awayGoals,
      bPoints: pb.totalPoints,
    })
    .from(pa)
    .innerJoin(match, eq(match.id, pa.matchId))
    .innerJoin(round, eq(round.id, pa.roundId))
    .innerJoin(pb, and(eq(pb.matchId, pa.matchId), eq(pb.userId, opts.bId)))
    .where(
      and(
        eq(pa.userId, opts.aId),
        eq(match.competitionId, opts.competitionId),
        isNotNull(pa.totalPoints),
        isNotNull(pb.totalPoints),
        isNotNull(match.fullTimeHome),
        isNotNull(match.fullTimeAway),
      ),
    )
    .orderBy(asc(match.kickoffTime))

  const clean: H2HPickRow[] = rows.map((r) => ({
    matchId: r.matchId,
    roundLabel: r.roundLabel,
    roundOrder: r.roundOrder,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    homeCode: r.homeCode,
    awayCode: r.awayCode,
    actualHome: r.actualHome as number,
    actualAway: r.actualAway as number,
    aHome: r.aHome,
    aAway: r.aAway,
    aPoints: r.aPoints as number,
    bHome: r.bHome,
    bAway: r.bAway,
    bPoints: r.bPoints as number,
  }))

  return computeHeadToHead(comp.name, a, b, clean)
}
