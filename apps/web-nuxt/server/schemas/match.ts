import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { match, prediction, round } from '../../db/schema'

// Shared response schemas for match-shaped payloads. Derived from the drizzle
// tables (drizzle-zod) where the shape is a DB projection so the field types +
// nullability track the schema exactly - the handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches. Lives under
// server/schemas (not server/utils) so it is out of the coverage gate; route
// files are thin and uncovered by design.
const matchCols = createSelectSchema(match)
const roundCols = createSelectSchema(round)

// The `matchColumns` projection shared by listMatches / getMatchDetail /
// getTeamMatches (server/utils/matches/service.ts): match-table columns plus the
// three round-derived fields, with match.groupName exposed under the key `group`.
export const matchRowSchema = z.object({
  id: matchCols.shape.id,
  competitionId: matchCols.shape.competitionId,
  providerMatchId: matchCols.shape.providerMatchId,
  stage: matchCols.shape.stage,
  group: matchCols.shape.groupName,
  homeTeam: matchCols.shape.homeTeam,
  awayTeam: matchCols.shape.awayTeam,
  homeTeamCode: matchCols.shape.homeTeamCode,
  awayTeamCode: matchCols.shape.awayTeamCode,
  kickoffTime: matchCols.shape.kickoffTime,
  status: matchCols.shape.status,
  fullTimeHome: matchCols.shape.fullTimeHome,
  fullTimeAway: matchCols.shape.fullTimeAway,
  penaltiesHome: matchCols.shape.penaltiesHome,
  penaltiesAway: matchCols.shape.penaltiesAway,
  winner: matchCols.shape.winner,
  scoringState: matchCols.shape.scoringState,
  roundId: matchCols.shape.roundId,
  roundLabel: roundCols.shape.label,
  matchday: roundCols.shape.matchday,
  roundSortOrder: roundCols.shape.sortOrder,
})

// One full prediction row (getMatchDetail's myPrediction is a plain `select()`).
export const predictionRowSchema = createSelectSchema(prediction)

// MatchOddsView (server/utils/odds/store.ts): the newest 1X2 snapshot per match,
// the OddsTriple current price plus opening and per-bookmaker prices.
const oddsTripleSchema = z.object({ home: z.number(), draw: z.number(), away: z.number() })
const storedBookmakerOddsSchema = z.object({
  key: z.string(),
  title: z.string(),
  home: z.number(),
  draw: z.number(),
  away: z.number(),
})
export const matchOddsViewSchema = z.object({
  ...oddsTripleSchema.shape,
  fetchedAt: z.date(),
  initial: oddsTripleSchema.nullable(),
  bookmakers: z.array(storedBookmakerOddsSchema).nullable(),
})

// StandingRow (server/utils/stats/standings.ts): one computed group-table row.
export const standingRowSchema = z.object({
  code: z.string().nullable(),
  name: z.string(),
  played: z.number(),
  won: z.number(),
  drawn: z.number(),
  lost: z.number(),
  gf: z.number(),
  ga: z.number(),
  gd: z.number(),
  points: z.number(),
})
