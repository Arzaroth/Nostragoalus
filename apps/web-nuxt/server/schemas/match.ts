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

// --- upstream live match detail ---
// Mirrors MatchDetail + TeamMatchStats (shared/types/match.ts) as the provider
// adapters normalize them, so /api/matches/{id}/live-detail publishes a real
// shape instead of an opaque blob. A provider value outside these types is a
// normalizer bug, not something the client should have to string-poke around.

const sideSchema = z.enum(['HOME', 'AWAY'])

export const liveDetailGoalSchema = z.object({
  side: sideSchema,
  teamId: z.string().nullable(),
  teamName: z.string(),
  teamCode: z.string().nullable(),
  playerId: z.string().nullable(),
  playerName: z.string(),
  minute: z.string().nullable(),
  goalType: z.number().nullable(),
  ownGoal: z.boolean(),
  assistPlayerId: z.string().nullable(),
  assistPlayerName: z.string().nullable(),
})

export const liveDetailBookingSchema = z.object({
  side: sideSchema,
  playerId: z.string().nullable(),
  playerName: z.string(),
  minute: z.string().nullable(),
  card: z.enum(['YELLOW', 'SECOND_YELLOW', 'RED']),
  coach: z.boolean().optional(),
})

export const liveDetailSubstitutionSchema = z.object({
  side: sideSchema,
  minute: z.string().nullable(),
  playerOffId: z.string().nullable(),
  playerOffName: z.string(),
  playerOnId: z.string().nullable(),
  playerOnName: z.string(),
})

// TeamMatchStats: the FIFA football-intelligence per-team numbers. Every key is
// nullable - a feed that ships only some of them still validates.
export const teamMatchStatsSchema = z.object({
  possession: z.number().nullable(),
  attempts: z.number().nullable(),
  onTarget: z.number().nullable(),
  passes: z.number().nullable(),
  passesCompleted: z.number().nullable(),
  crosses: z.number().nullable(),
  corners: z.number().nullable(),
  fouls: z.number().nullable(),
  offsides: z.number().nullable(),
  distanceKm: z.number().nullable(),
  pressuresApplied: z.number().nullable(),
  forcedTurnovers: z.number().nullable(),
})

export const teamCardsSchema = z.object({ yellow: z.number(), red: z.number() })

export const matchLiveDetailSchema = z.object({
  minute: z.string().nullable().optional(),
  halfTime: z.boolean().optional(),
  possessionHome: z.number().nullable(),
  possessionAway: z.number().nullable(),
  attendance: z.number().nullable(),
  stadium: z.string().nullable(),
  cards: z.object({ home: teamCardsSchema, away: teamCardsSchema }),
  goals: z.array(liveDetailGoalSchema),
  bookings: z.array(liveDetailBookingSchema),
  substitutions: z.array(liveDetailSubstitutionSchema),
  playerNames: z.record(z.string(), z.string()).optional(),
  ifesId: z.string().nullable(),
  homeTeamId: z.string().nullable(),
  awayTeamId: z.string().nullable(),
  stats: z
    .object({ home: teamMatchStatsSchema.nullable(), away: teamMatchStatsSchema.nullable() })
    .nullable(),
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
