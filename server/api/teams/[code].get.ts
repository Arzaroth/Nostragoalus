import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { match } from '../../../db/schema'
import { resolveCompetition } from '../../utils/competitions/store'
import { getTeamMatches } from '../../utils/matches/service'
import { computeGroupStandings } from '../../utils/stats/standings'
import { getCompetitionTopScorers } from '../../utils/stats/scorers'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') as string
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { team: null, matches: [], group: null, standings: null, topScorer: null, topAssister: null }

  const matches = await getTeamMatches(db, competition.id, code)
  let name = code
  for (const m of matches) {
    if (m.homeTeamCode === code) {
      name = m.homeTeam
      break
    }
    if (m.awayTeamCode === code) {
      name = m.awayTeam
      break
    }
  }

  const groupName = matches.find((m) => m.group)?.group ?? null
  let standings = null
  if (groupName) {
    const groupMatches = await db
      .select()
      .from(match)
      .where(and(eq(match.competitionId, competition.id), eq(match.groupName, groupName)))
    standings = computeGroupStandings(groupMatches)
  }

  const teamScorers = (await getCompetitionTopScorers(db, competition.id, 500)).filter((s) => s.teamCode === code)
  const topScorer = teamScorers.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals)[0] ?? null
  const topAssister = teamScorers
    .filter((s) => (s.assists ?? 0) > 0)
    .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0] ?? null

  return { team: { code, name, competition: competition.slug }, matches, group: groupName, standings, topScorer, topAssister }
})
