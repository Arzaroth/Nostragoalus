import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { match } from '../../../db/schema'
import { providerForCompetition } from '../../utils/providers'
import { orderBracketFeeders } from '../../utils/providers/bracket-order'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { computeAllGroupStandings, selectGroupStandingsRows } from '../../utils/stats/standings'
import { tiebreakersForCompetition, type Criterion } from '../../utils/stats/tiebreakers'
import { projectBracket } from '../../utils/bracket/projection'
import { getCachedBracket, setCachedBracket } from '../../utils/bracket/cache'

const querySchema = z.object({ competition: z.string().optional() })

// The projected knockout tree (NormalizedBracket in shared/types/match.ts).
// MatchStatus is left as a string here - the union of provider statuses widens
// to string and the value is display-only.
const bracketMatchSchema = z.object({
  id: z.string().nullable().optional(),
  providerMatchId: z.string(),
  matchNumber: z.number().nullable().optional(),
  homeTeam: z.string(),
  homeCode: z.string().nullable(),
  awayTeam: z.string(),
  awayCode: z.string().nullable(),
  homeProjectedCode: z.string().nullable().optional(),
  homeProjectedTeam: z.string().nullable().optional(),
  awayProjectedCode: z.string().nullable().optional(),
  awayProjectedTeam: z.string().nullable().optional(),
  homeScore: z.number().nullable(),
  awayScore: z.number().nullable(),
  homePens: z.number().nullable(),
  awayPens: z.number().nullable(),
  winner: z.enum(['HOME', 'AWAY']).nullable(),
  status: z.string(),
  kickoffTime: z.string(),
})
const bracketSchema = z.object({
  winner: z.object({ name: z.string(), code: z.string().nullable() }).nullable(),
  rounds: z.array(z.object({ name: z.string(), sequence: z.number(), matches: z.array(bracketMatchSchema) })),
})
const responseSchema = z.object({ bracket: bracketSchema.nullable() })

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
  const rows = await selectGroupStandingsRows(db, competitionId)
  return computeAllGroupStandings(rows, { includeLive: true, tiebreakers })
}

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
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
