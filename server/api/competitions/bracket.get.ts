import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { match } from '../../../db/schema'
import { providerForCompetition } from '../../utils/providers'
import { orderBracketFeeders } from '../../utils/providers/bracket-order'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { computeAllGroupStandings } from '../../utils/stats/standings'
import { tiebreakersForCompetition, type Criterion } from '../../utils/stats/tiebreakers'
import { projectBracket } from '../../utils/bracket/projection'
import { getCachedBracket, setCachedBracket } from '../../utils/bracket/cache'

async function buildBaseBracket(competitionId: string, provider: ReturnType<typeof providerForCompetition>) {
  let bracket = await provider.getBracket!()
  if (!bracket) return null
  bracket = orderBracketFeeders(bracket)
  // Link each bracket match to our internal match id (for navigation).
  const ours = await db.select({ id: match.id, pid: match.providerMatchId }).from(match).where(eq(match.competitionId, competitionId))
  const idByProvider = new Map(ours.map((m) => [m.pid, m.id]))
  for (const round of bracket.rounds) {
    for (const m of round.matches) m.id = idByProvider.get(m.providerMatchId) ?? null
  }
  return bracket
}

async function groupStandingsFor(competitionId: string, tiebreakers: Criterion[]) {
  const rows = await db
    .select({
      group: match.groupName,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      status: match.status,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'GROUP')))
  return computeAllGroupStandings(rows, { includeLive: true, tiebreakers })
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { bracket: null }

  try {
    let base = getCachedBracket(competition.id, Date.now())
    if (base === undefined) {
      const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
      base = provider.getBracket ? await buildBaseBracket(competition.id, provider) : null
      setCachedBracket(competition.id, Date.now(), base)
    }
    if (!base) return { bracket: null }
    const tb = tiebreakersForCompetition(competition.slug)
    return { bracket: projectBracket(base, await groupStandingsFor(competition.id, tb.withinGroup), tb.bestThird) }
  } catch (error) {
    // Fail safe to "no bracket", but log so an outage isn't mistaken for the
    // empty state.
    console.error('[bracket] failed to build/project', error)
    return { bracket: null }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "Knockout bracket",
    "description": "The knockout tree (rounds, feeders ordered under their parents) plus the champion once decided. Null while no knockout structure exists.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Bracket rounds and winner, or null."
      }
    }
  },
})
